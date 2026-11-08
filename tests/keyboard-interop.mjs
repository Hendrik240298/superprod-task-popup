// Actual Keyboard Ergonomics + popup code; only the native host DOM/API is a fixture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
if (!process.env.KEYBOARD_PLUGIN_SOURCE) {
  throw new Error(
    "Set KEYBOARD_PLUGIN_SOURCE to the actual Keyboard Ergonomics plugin.js",
  );
}
const root = new URL("../", import.meta.url);
const popup = (await readFile(new URL("src/plugin.js", root), "utf8")).replace(
  '/* INLINE_CSS */ ""',
  JSON.stringify(await readFile(new URL("src/style.css", root), "utf8")),
);
const keyboard = await readFile(process.env.KEYBOARD_PLUGIN_SOURCE, "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`<style>task-detail-panel,.side {display:block}</style>
    <main><right-panel class="isOpen"><div class="content"><button id="background">Background</button></div>
    <div class="side"><div class="right-panel"><button class="edge-close-handle">native close</button>
    <div class="side-inner"><task-detail-panel><button id="editor-action">Editor action</button><textarea>Pending draft</textarea></task-detail-panel></div></div></div></right-panel></main>
    <div class="cdk-overlay-container"></div>`);
  await page.evaluate(() => {
    window.shortcuts = {};
    window.popupUnload = [];
    window.keyboardUnload = [];
    window.snacks = [];
    window.nativeCloses = 0;
    document.querySelector(".edge-close-handle").addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") window.nativeCloses++;
      },
    );
  });
  const executePopup = async () => {
    await page.evaluate((code) => {
      new Function("PluginAPI", code)({
        onUnload: (fn) => window.popupUnload.push(fn),
      });
    }, popup);
    await page.waitForFunction(() =>
      document.querySelector("[data-task-popup-dialog]")
    );
  };
  await page.evaluate((code) => {
    new Function("PluginAPI", "plugin", code)({
      registerShortcut: (shortcut) => {
        window.shortcuts[shortcut.id] = shortcut.onExec;
      },
      getAllProjects: async () => [{ id: "ALPHA", title: "Alpha" }],
      showSnack: (snack) => window.snacks.push(snack),
    }, { onUnload: (fn) => window.keyboardUnload.push(fn) });
  }, keyboard);
  await executePopup();
  await page.locator("#editor-action").focus();
  await page.evaluate(() => window.shortcuts["find-project"]());
  await page.waitForSelector("#spvm-input");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "spvm-input",
    "Popup stole the actual switcher's search focus",
  );
  await page.keyboard.type("Alpha");
  assert.equal(await page.locator("#spvm-input").inputValue(), "Alpha");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator("[data-task-popup-dialog]").evaluate((el) => el.inert),
    true,
    "Underlying native editor must be inert while navigation is modal",
  );
  assert.equal(
    await page.locator("[data-task-popup-dialog]").getAttribute("aria-modal"),
    "false",
  );
  assert.equal(await page.locator(".content").evaluate((el) => el.inert), true);
  await page.evaluate(() => {
    const unrelated = document.createElement("button");
    unrelated.id = "unrelated-dialog";
    unrelated.setAttribute("role", "dialog");
    document.body.append(unrelated);
    unrelated.focus();
  });
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "spvm-input",
    "A known picker must not disable focus safety for unrelated dialogs",
  );
  await page.locator("#unrelated-dialog").evaluate((el) => el.remove());
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "spvm-input",
  );
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "spvm-input",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    !document.querySelector("#superprod-vim-motions-picker")
  );
  await page.waitForFunction(() =>
    document.activeElement?.id === "editor-action"
  );
  assert.equal(await page.locator("[data-task-popup-dialog]").count(), 1);
  assert.equal(await page.evaluate(() => window.nativeCloses), 0);
  // Enable popup after Keyboard has already opened its body-level surface.
  await page.evaluate(() => window.popupUnload.at(-1)());
  await page.locator("#editor-action").focus();
  await page.evaluate(() => window.shortcuts["find-project"]());
  await executePopup();
  assert.equal(
    await page.locator("#superprod-vim-motions-picker").evaluate((el) =>
      el.inert
    ),
    false,
    "Mount made an already open Keyboard picker inert",
  );
  await page.keyboard.type("Alpha");
  assert.equal(await page.locator("#spvm-input").inputValue(), "Alpha");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    document.querySelector("[data-task-popup-dialog]")?.contains(
      document.activeElement,
    )
  );
  // Disable either plugin while the picker owns focus: never close the native
  // editor, lose its draft, or leave modal/inert state behind.
  await page.locator("textarea").fill("Draft survives both unload orders");
  await page.evaluate(() => window.shortcuts["find-project"]());
  await page.evaluate(() => window.popupUnload.at(-1)());
  assert.equal(
    await page.locator(
      "[data-task-popup-dialog],[data-task-popup-backdrop],[data-task-popup-style],[inert]",
    ).count(),
    0,
  );
  assert.equal(await page.locator(".side").getAttribute("aria-modal"), null);
  assert.equal(
    await page.locator("textarea").inputValue(),
    "Draft survives both unload orders",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "spvm-input",
  );
  await executePopup();
  await executePopup();
  assert.equal(await page.locator("[data-task-popup-style]").count(), 1);
  assert.equal(
    await page.locator("#superprod-vim-motions-picker").evaluate((el) =>
      el.inert
    ),
    false,
  );
  await page.evaluate(() => window.keyboardUnload.at(-1)());
  await page.waitForFunction(() => !document.querySelector(".side").inert);
  assert.equal(await page.locator(".side").getAttribute("aria-modal"), "true");
  assert.equal(
    await page.locator("textarea").inputValue(),
    "Draft survives both unload orders",
  );
  assert.equal(await page.locator("[data-task-popup-dialog]").count(), 1);
  assert.equal(await page.evaluate(() => window.nativeCloses), 0);

  // A hidden real picker stops being a higher overlay. Class/style/hidden and
  // role changes are observed even if its DOM stays mounted.
  await page.evaluate(() => window.shortcuts["find-project"]());
  await page.locator("#superprod-vim-motions-picker").evaluate((el) => {
    el.hidden = true;
    el.style.display = "none";
  });
  await page.waitForFunction(() => !document.querySelector(".side").inert);
  assert.equal(await page.locator(".side").getAttribute("aria-modal"), "true");
  await page.evaluate(() => window.keyboardUnload.at(-1)());

  // Negative controls are deliberately not the combined fixture: only the real
  // picker above is accepted. Unrelated dialogs/empty or malformed roots aren't.
  for (
    const markup of [
      '<div role="dialog"><input></div>',
      '<div id="superprod-vim-motions-picker"><input></div>',
      '<div id="superprod-vim-motions-picker"><div role="dialog"><input></div></div>',
      '<div id="superprod-vim-motions-picker"><div class="spvm-panel" role="dialog" style="visibility:hidden"><input style="visibility:visible"></div></div>',
    ]
  ) {
    await page.evaluate((html) => {
      const probe = document.createElement("div");
      probe.id = "probe";
      probe.innerHTML = html;
      document.body.append(probe);
      probe.querySelector("input").focus();
    }, markup);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-task-popup-close")
      ),
      true,
    );
    assert.equal(await page.locator(".side").evaluate((el) => el.inert), false);
    await page.locator("#probe").evaluate((el) => el.remove());
  }

  // Keep CDK's existing parent-trigger Escape path and numeric keyCode contract.
  await page.evaluate(() => {
    const pane = document.createElement("div");
    pane.className = "cdk-overlay-pane";
    pane.innerHTML = '<div role="dialog"><input></div>';
    pane.addEventListener("keydown", (e) => {
      if (e.keyCode === 27) {
        window.cdkEscapes = (window.cdkEscapes || 0) + 1;
        pane.remove();
      }
    });
    document.querySelector(".cdk-overlay-container").append(pane);
    document.querySelector("#editor-action").focus();
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.cdkEscapes), 1);
  assert.equal(await page.evaluate(() => window.nativeCloses), 0);
  await page.locator("textarea").focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() => window.nativeCloses),
    0,
    "Native editor owns its first Escape",
  );

  // Returning to the native mobile sheet must also release suspended modality.
  await page.evaluate(() => window.shortcuts["find-project"]());
  await page.setViewportSize({ width: 599, height: 900 });
  await page.waitForFunction(() =>
    !document.querySelector("[data-task-popup-dialog]")
  );
  assert.equal(await page.locator(".side").evaluate((el) => el.inert), false);
  assert.equal(await page.locator(".side").getAttribute("role"), null);
  assert.equal(
    await page.locator("textarea").inputValue(),
    "Draft survives both unload orders",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => document.querySelector(".side").inert);
  await page.evaluate(() => {
    window.keyboardUnload.at(-1)();
    window.popupUnload.at(-1)();
  });
  assert.equal(
    await page.locator(
      "[data-task-popup-dialog],[data-task-popup-backdrop],[data-task-popup-style],[inert]",
    ).count(),
    0,
  );
  assert.deepEqual(errors, []);
  // Exercise the actual companion's draft-safe navigation contract. The host
  // fixture models only blur-to-save and native state/leave-animation teardown;
  // Angular persistence itself belongs to the installed-app suite.
  const nativeSide = await page.locator(".side").evaluate((el) => el.outerHTML);
  await page.locator(".side").evaluate((el) => el.remove());
  for (const destination of ["project", "inbox"]) {
    await page.evaluate((html) => {
      const host = document.querySelector("right-panel");
      host.insertAdjacentHTML("beforeend", html);
      host.classList.add("isOpen");
      window.nativeEvents = [];
      window.snacks = [];
      const side = host.querySelector(".side");
      side.querySelector("textarea").addEventListener("blur", (e) => {
        window.savedDraft = e.target.value;
        window.nativeEvents.push("blur-save");
      });
      side.querySelector(".edge-close-handle").addEventListener(
        "keydown",
        (e) => {
          if (e.key !== "Enter") return;
          window.nativeEvents.push("native-close");
          host.classList.remove("isOpen");
          setTimeout(() => side.remove(), 40);
        },
      );
    }, nativeSide);
    await executePopup();
    const draft = `Pending native draft before ${destination}`;
    await page.locator("textarea").fill(draft);
    if (destination === "project") {
      await page.evaluate(() => window.shortcuts["find-project"]());
      await page.locator("#spvm-input").fill("Alpha");
      await page.keyboard.press("Enter");
    } else {
      await page.evaluate(() => window.shortcuts["go-to-inbox"]());
    }
    const route = destination === "project"
      ? "#/project/ALPHA/tasks"
      : "#/project/INBOX_PROJECT/tasks";
    await page.waitForFunction(
      (expected) => location.hash === expected || window.snacks.length,
      route,
    );
    assert.deepEqual(
      await page.evaluate(() => window.snacks),
      [],
      "Companion rejected native popup close (the close control is intentionally display:none)",
    );
    await page.waitForFunction(() => !document.querySelector(".side"));
    assert.equal(await page.evaluate(() => window.savedDraft), draft);
    assert.deepEqual(await page.evaluate(() => window.nativeEvents), [
      "blur-save",
      "native-close",
    ]);
    assert.equal(
      await page.locator(
        "#superprod-vim-motions-picker,[data-task-popup-dialog],[data-task-popup-backdrop],[data-task-popup-host],[data-task-popup-retiring],[inert]",
      ).count(),
      0,
    );
    await page.evaluate(() => window.popupUnload.at(-1)());
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual picker typing/Tab/Escape, both mount/unload orders, duplicate reload, modal safety, drafts, narrow recognition, CDK/editor Escape, mobile cleanup and native-close-before-project/Inbox navigation",
  );
} finally {
  await browser.close();
}
