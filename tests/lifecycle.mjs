// Isolated browser regression for plugin lifecycle, using the actual plugin code.
// This fixture models the native panel DOM only; real-app tests live alongside it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = new URL("../", import.meta.url);
const source = (await readFile(new URL("src/plugin.js", root), "utf8")).replace(
  '/* INLINE_CSS */ ""',
  JSON.stringify(await readFile(new URL("src/style.css", root), "utf8")),
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.setContent(`<style>task-detail-panel,.side {display:block}</style>
    <main><right-panel class="isOpen"><div class="content"><button>Background</button></div>
    <div class="side"><div class="right-panel"><button class="edge-close-handle">native close</button>
    <div class="side-inner"><task-detail-panel><task-detail-item><section class="input-item"><button class="input-item__edit-btn">Hidden hover action</button></section></task-detail-item><button>Editor action</button><textarea>Pending draft</textarea></task-detail-panel></div></div></div></right-panel></main>`);
  const execute = async () => {
    await page.evaluate((code) => {
      window.unloadCallbacks ||= [];
      new Function("PluginAPI", code)({
        onUnload: (fn) => window.unloadCallbacks.push(fn),
      });
    }, source);
    await page.waitForFunction(() =>
      document.querySelector("[data-task-popup-dialog]")
    );
    await page.evaluate(() =>
      new Promise((resolve) => requestAnimationFrame(resolve))
    );
  };
  await execute();
  await execute();
  assert.equal(
    await page.locator("[data-task-popup-style]").count(),
    1,
    "Reload duplicated styles/listeners",
  );
  assert.equal(
    await page.locator("[data-task-popup-close]").count(),
    1,
    "Reload duplicated popup",
  );
  // A stale host unload callback must not dismantle the replacement instance.
  await page.evaluate(() => window.unloadCallbacks[0]());
  assert.equal(await page.locator("[data-task-popup-dialog]").count(), 1);
  // Reserved hover slots keep a box but must not be focus-trap destinations.
  await page.mouse.move(0, 0);
  await page.locator("[data-task-popup-close]").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Editor action",
    "Tab wrapped into a visibility:hidden hover button",
  );
  await page.locator("textarea").fill("Draft preserved across plugin disable");
  await page.evaluate(() => window.unloadCallbacks.at(-1)());
  assert.equal(
    await page.locator(
      "[data-task-popup-style],[data-task-popup-dialog],[data-task-popup-close],[data-task-popup-backdrop],[data-task-popup-host],[data-task-popup-retiring],[inert]",
    ).count(),
    0,
  );
  assert.equal(
    await page.locator("textarea").inputValue(),
    "Draft preserved across plugin disable",
  );
  assert.equal(await page.locator(".side").getAttribute("role"), null);
  // Model Angular retaining an outgoing .side while its leave animation runs.
  await execute();
  await page.evaluate(() =>
    document.querySelector("right-panel").classList.remove("isOpen")
  );
  await page.waitForFunction(() =>
    document.querySelector("[data-task-popup-retiring]")
  );
  assert.equal(
    await page.locator("[data-task-popup-retiring]").isVisible(),
    false,
  );
  await page.evaluate(() => {
    const host = document.querySelector("right-panel");
    const fresh = host.querySelector(".side").cloneNode(true);
    fresh.removeAttribute("data-task-popup-retiring");
    host.append(fresh);
    host.classList.add("isOpen");
  });
  await page.waitForFunction(() =>
    document.querySelector("[data-task-popup-dialog]")
  );
  assert.equal(await page.locator("[data-task-popup-dialog]").count(), 1);
  assert.equal(
    await page.locator("[data-task-popup-retiring]").isVisible(),
    false,
  );
  await page.evaluate(() => window.unloadCallbacks.at(-1)());
  assert.equal(
    await page.locator(
      "[data-task-popup-retiring],[data-task-popup-dialog],[data-task-popup-style],[inert]",
    ).count(),
    0,
  );
  console.log(
    "PASS duplicate execution, stale unload, draft preservation, retiring-panel cleanup and rapid reopen",
  );
} finally {
  await browser.close();
}
