/* global PluginAPI */
(() => {
  "use strict";
  const css = /* INLINE_CSS */ "";
  // The native panel has no supported presentation API. This background plugin
  // adapts its DOM in place; it never imports Angular or moves/clones the editor.
  // Require unload support rather than leave listeners/styles behind on old hosts.
  if (typeof PluginAPI.onUnload !== "function") {
    console.warn("Task Details Popup needs a host with plugin unload support.");
    return;
  }
  // Older hosts can execute a plugin twice during install/enable. Own exactly
  // one instance, and clean up the old one before touching any shared markers.
  const instanceKey = Symbol.for("superprod.task-details-popup.cleanup");
  window[instanceKey]?.();
  const mobile = window.matchMedia("(max-width: 599px)");
  const style = document.createElement("style");
  style.dataset.taskPopupStyle = "";
  style.textContent = css;
  document.head.append(style);

  let active = null;
  let lastOrigin = document.activeElement;
  let frame = 0;
  let disposed = false;
  const retiring = new Set();
  const undoInert = [];
  const timers = new Set();
  const later = (fn, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) fn();
    }, delay);
    timers.add(timer);
  };
  const isEditor = (el) =>
    el instanceof HTMLElement &&
    (!!el.closest("input,textarea,select,[contenteditable],.cm-editor") ||
      el.isContentEditable);
  const visible = (el) =>
    el instanceof HTMLElement && el.getClientRects().length > 0 &&
    !["hidden", "collapse"].includes(getComputedStyle(el).visibility);
  // Keyboard Ergonomics owns one known non-CDK navigation surface. Neither an
  // arbitrary dialog nor an empty/hidden picker shell may suspend this modal.
  const navigationOverlay = () => {
    const root = document.getElementById("superprod-vim-motions-picker");
    const panel = root?.querySelector('.spvm-panel[role="dialog"]');
    return visible(root) && visible(panel) ? root : null;
  };
  const nativeOverlayOpen = () =>
    Array.from(document.querySelectorAll(
      ".cdk-overlay-pane",
    )).some((el) =>
      visible(el) && el.childElementCount > 0 &&
      !el.querySelector(
        "mat-snack-bar-container,.mat-mdc-tooltip,mat-tooltip-component",
      )
    );
  const overlayOpen = () => !!navigationOverlay() || nativeOverlayOpen();
  const focusables = () =>
    active
      ? Array.from(active.side.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]',
      )).filter((el) =>
        visible(el) && el.tabIndex >= 0 && !el.closest("[inert]")
      )
      : [];

  function requestClose() {
    if (!active || overlayOpen()) return;
    // Use the native close control, whose handler blurs pending editors before
    // clearing selection. A programmatic click doesn't invoke its pointer handler.
    document.activeElement?.blur?.();
    active.nativeClose.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
  }

  function restoreInert() {
    for (const [el, wasInert] of undoInert.splice(0)) el.inert = wasInert;
  }

  function syncNavigationModal() {
    if (!active) return;
    if (navigationOverlay()) {
      if (!active.navigation) {
        active.navigation = { inert: active.side.inert };
        active.side.inert = true;
        active.side.setAttribute("aria-modal", "false");
      }
    } else if (active.navigation) {
      active.side.inert = active.navigation.inert;
      active.navigation = null;
      active.side.setAttribute("aria-modal", "true");
      // Removing the picker may attempt focus while its parent editor is still
      // inert. Restore only after reactivating that editor, never by closing it.
      if (
        !active.side.contains(document.activeElement) && !nativeOverlayOpen()
      ) {
        const target = active.popupFocus;
        (target?.isConnected && visible(target) ? target : active.close).focus({
          preventScroll: true,
        });
      }
    }
  }

  function release(restoreFocus = false) {
    if (!active) return;
    const old = active;
    active = null;
    if (old.navigation) old.side.inert = old.navigation.inert;
    if (restoreFocus) {
      // Angular retains this node during its width-to-zero leave animation.
      // Never restore sidebar presentation while that outgoing node is alive.
      old.side.setAttribute("data-task-popup-retiring", "");
      retiring.add(old.side);
    }
    old.backdrop.remove();
    old.close.remove();
    old.host.removeAttribute("data-task-popup-host");
    for (const [attr, value] of old.attributes) {
      if (value === null) old.side.removeAttribute(attr);
      else old.side.setAttribute(attr, value);
    }
    restoreInert();
    if (restoreFocus) {
      // Native side-panel animation also restores focus. Run after it and handle
      // the Kanban iframe locally (its own window focus listener restores cards).
      later(() => {
        if (
          !active && !mobile.matches && !overlayOpen() &&
          old.origin?.isConnected
        ) {
          old.origin.focus({ preventScroll: true });
        }
      }, 260);
    }
  }

  function mount(host, side, nativeClose) {
    // Focusing an iframe does not send its inner focusin events to this document.
    const origin = document.activeElement instanceof HTMLIFrameElement
      ? document.activeElement
      : lastOrigin;
    const backdrop = document.createElement("div");
    backdrop.dataset.taskPopupBackdrop = "";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("pointerdown", (event) => event.preventDefault());
    backdrop.addEventListener("click", requestClose);
    const close = document.createElement("button");
    close.type = "button";
    close.dataset.taskPopupClose = "";
    close.setAttribute("aria-label", "Close task details");
    close.textContent = "×";
    close.addEventListener("click", requestClose);
    const attributes = [
      "data-task-popup-dialog",
      "role",
      "aria-modal",
      "aria-label",
      "tabindex",
    ]
      .map((attr) => [attr, side.getAttribute(attr)]);
    active = {
      host,
      side,
      nativeClose,
      backdrop,
      close,
      attributes,
      origin,
      popupFocus: close,
      navigation: null,
    };
    host.setAttribute("data-task-popup-host", "");
    side.setAttribute("data-task-popup-dialog", "");
    side.setAttribute("role", "dialog");
    side.setAttribute("aria-modal", "true");
    side.setAttribute("aria-label", "Task details");
    side.tabIndex = -1;
    host.insertBefore(backdrop, side);
    side.append(close);
    // Keep the native editor and its ancestor chain live, but make background
    // siblings inert. CDK child overlays and the known Keyboard picker stay live,
    // including when Keyboard mounted before this plugin was enabled.
    for (
      let node = side;
      node && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement?.children || []) {
        if (
          sibling === node || sibling === backdrop || sibling.matches(
            ".cdk-overlay-container,#superprod-vim-motions-picker,style,script,link",
          )
        ) continue;
        undoInert.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
    }
    syncNavigationModal();
    if (!overlayOpen()) close.focus({ preventScroll: true });
  }

  function sync() {
    frame = 0;
    if (disposed) return;
    for (const side of retiring) {
      if (!side.isConnected) {
        side.removeAttribute("data-task-popup-retiring");
        retiring.delete(side);
      }
    }
    const host = document.querySelector("right-panel.isOpen");
    const side = host?.querySelector(
      ":scope > .side:not([data-task-popup-retiring])",
    );
    const nativeClose = side?.querySelector(".edge-close-handle");
    const task = side?.querySelector("task-detail-panel");
    const eligible = !mobile.matches && task && nativeClose &&
      !side.querySelector(
        "notes,issue-panel,plugin-panel-container,schedule-day-panel",
      );
    if (active && (!eligible || active.side !== side)) {
      release(!mobile.matches && !host);
    }
    if (!active && eligible) mount(host, side, nativeClose);
    syncNavigationModal();
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(sync);
  }

  function onKey(event) {
    if (!active) return;
    syncNavigationModal();
    // Its own handler owns typing, Tab and Escape (including focus restoration).
    if (navigationOverlay()) return;
    if (overlayOpen()) {
      // Some native child dialogs leave focus on their parent trigger. Keep
      // Escape away from task-detail-item (which otherwise collapses the parent)
      // and send it through the CDK overlay's normal keyboard dispatcher instead.
      if (event.key === "Escape" && active.side.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const pane = Array.from(document.querySelectorAll(".cdk-overlay-pane"))
          .filter((el) =>
            visible(el) && !el.querySelector(
              "mat-snack-bar-container,.mat-mdc-tooltip,mat-tooltip-component",
            )
          ).at(-1);
        pane?.dispatchEvent(
          new KeyboardEvent("keydown", {
            // Angular CDK's dialog dispatcher still tests numeric keyCode.
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      return;
    }
    if (event.key === "Escape") {
      if (isEditor(event.target)) return; // Native editor owns its first Escape.
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClose();
    } else if (event.key === "Tab") {
      const items = focusables();
      const index = items.indexOf(document.activeElement);
      if (
        !items.length || index < 0 ||
        (!event.shiftKey && index === items.length - 1) ||
        (event.shiftKey && index === 0)
      ) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) : items[0])?.focus();
        if (!items.length) active.side.focus();
      }
    }
  }

  function onFocus(event) {
    syncNavigationModal();
    const navigation = active && navigationOverlay();
    if (navigation) {
      if (!navigation.contains(event.target) && !nativeOverlayOpen()) {
        navigation.querySelector("input")?.focus({ preventScroll: true });
      }
      return;
    }
    if (active?.side.contains(event.target)) active.popupFocus = event.target;
    if (!active) {
      if (!event.target.closest?.("right-panel > .side")) {
        lastOrigin = event.target.closest?.("task") || event.target;
      }
    } else if (!active.side.contains(event.target) && !overlayOpen()) {
      active.close.focus({ preventScroll: true });
    }
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "role"],
  });
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("focusin", onFocus, true);
  mobile.addEventListener("change", schedule);
  schedule();
  function cleanup() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    cancelAnimationFrame(frame);
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("focusin", onFocus, true);
    mobile.removeEventListener("change", schedule);
    release();
    for (const side of retiring) {
      side.removeAttribute("data-task-popup-retiring");
    }
    retiring.clear();
    style.remove();
    if (window[instanceKey] === cleanup) delete window[instanceKey];
  }
  window[instanceKey] = cleanup;
  PluginAPI.onUnload(cleanup);
})();
