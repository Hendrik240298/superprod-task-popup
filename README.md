# Task Details Popup for Super Productivity

A **separate installable plugin** that presents the existing desktop task editor as a centred popup in **List and Kanban**. It leaves mobile bottom sheets and non-task sidebars alone.

**No patched app, custom app installer, theme change, web server or replacement web app is needed.**

> Early release: start with disposable tasks. This plugin adapts internal app DOM, so app upgrades can require a plugin update.

## Install

Requires Super Productivity **19.1.0 or newer**. Start with disposable tasks.

1. **[Download task-details-popup.zip from the latest release](https://github.com/Hendrik240298/superprod-task-popup/releases/latest/download/task-details-popup.zip)**. Do not unzip it. You can also build the ZIP from source below.
2. Open **Settings → Plugins → Choose Plugin File**, select the ZIP and accept the installation prompt if shown. Re-upload the newer ZIP when upgrading.
3. Enable **Task Details Popup** in the plugin list.
4. Open a task normally, from List or Project Kanban.

Like [Project Kanban](https://github.com/Hendrik240298/superprod-kanban), successful [CI runs](https://github.com/Hendrik240298/superprod-task-popup/actions/workflows/release.yml) provide an expiring build artifact. Version tags publish the stable Release ZIP linked above; CI artifacts require GitHub sign-in.

This is independent of **Project Kanban**: the two plugins have different IDs and ZIPs. Keep Kanban installed for its board/dragging features; install this plugin for popup presentation. It works in List even without Kanban installed.

Turn off Task Details Popup to return to the normal sidebar. Disabling removes its styles, listeners, backdrop and focus handling; it does not delete tasks or rewrite settings. The plugin has no separate navigation entry or configuration screen.

## Behaviour

- At widths **600px and above**, existing native task details appear in a centred overlay. The list/board underneath keeps its full width.
- **v0.2.1:** a rounded desktop popup with the **original stacked editor at every width**. The experimental right-hand metadata column and flattened card/editor styles were removed. Native/theme card backgrounds, complete borders, focus states, typography and field order are preserved instead of being partially repainted by the plugin.
- **v0.2.2:** the native title's intentional bottom-only underline is replaced, in desktop popups only, by a complete 1px frame matching the other cards. Its colour is subtle at rest and uses the theme's focus accent while editing; border widths stay constant. Other native field styling and the mobile sheet remain unchanged.
- **v0.2.3:** the title has **one** visible frame: its native inline-edit border, elevation and extra inner focus outline are suppressed inside the popup, while native text metrics and saving stay intact. The popup now **fits its content** instead of reserving a fixed height below the creation date. Long content uses the inner scroller, capped at 760px, 90% of viewport height and available space below the window-controls band (whichever is smallest).
- **v0.2.4:** matching scrollbar gutters on both sides centre the title and cards, whether or not the popup needs scrolling. Hover and scrollbar stability are retained.
- **v0.2.5:** keyboard focus in task-detail rows uses the native rounded card frame alone. A broad theme focus rule can no longer draw a second square outline around Subtasks, Duration or Notes in the popup. Other controls keep their focus indicators; the normal sidebar and mobile sheet are unchanged.
- Native hover-action buttons have reserved space, so revealing them does not push field values around. A stable scrollbar gutter prevents content-width jumps when content needs scrolling. These adjustments are desktop-popup-only; hidden hover buttons are excluded from the focus trap.
- Opening and closing happen in place, without a sidebar slide or page-width jump. The native outgoing sidebar is hidden while Angular finishes its internal teardown; rapid reopening cannot revive that outgoing node. Native expansion animations inside the editor are retained.
- Below 600px, the app's native bottom sheet remains unchanged. Navigation and project Notes/other non-task panels are not redesigned.
- The editor is the original live Angular editor, not a replica: title, notes, subtasks, estimates, scheduling, tags, attachments and other native controls remain the app's own.
- Scheduling and deadlines are both native, independent app fields. Scheduling is the planned work date/time (`dueDay`/`dueWithTime` in the app model); the deadline is the finish-by date/time (`deadlineDay`/`deadlineWithTime`). This plugin adds no date fields or scheduling logic.
- Close with **×**, the backdrop, or Escape. Native editor Escape handling comes first while editing; another Escape dismisses the popup. Closing uses the native close handler so pending fields blur/save before selection clears.
- Native child dialogs and menus stay above the popup. Escape dismisses a child first, not both child and parent. Tab stays within the popup unless a native child overlay owns focus.
- Focus returns to the native task or originating plugin iframe. Project Kanban 0.7.4 restores its remembered card when its iframe regains focus after a refresh.
- Surface/text/border colours follow the active app tokens. There is no dependency on the Todoist-style theme.

## Compatibility and limitations

This background-code plugin adapts the app's existing **DOM structure** with scoped CSS and DOM listeners. Super Productivity runs background plugin code in its renderer. No Angular imports, store access, component recreation, history manipulation or application patches are used. Nevertheless, **the native presentation structure is not a stable public plugin API**: future app UI changes or highly structural custom themes may need a plugin update. If the expected native panel/close control is absent, the plugin leaves the normal UI intact.

The plugin declares no task-mutation/network API permissions and sends nothing off the device. That is **not a sandbox guarantee**: background-code plugins are trusted renderer code and can see the app DOM. Only install plugins whose source you trust.

Verified in Chromium with:

- **Official released 19.1.0 app assets**, extracted unchanged from upstream's `app-play-release.apk` and served for browser testing. This verifies the released UI/plugin loader, **not a physical Android WebView or signed APK installation**.
- **Unmodified upstream app 19.3.1 source**, commit `55198f6e49e242d293999514e3e44ccd9b0a600a`, built only as a disposable test target. No custom build is required or distributed for use.

The 19.1.0 app itself omits its native More actions button on wide touch layouts (landscape/tablets); the popup preserves that limitation rather than manufacturing a replacement menu. The newer tested upstream has the native wide-touch button. Phone portrait retains native More actions in both tested versions. The plugin does not fix unrelated upstream breakpoint/history behaviour.

An additional native issue was reproduced with the plugin disabled: Escape from the add-subtask draft can throw in the app's `addSubTaskBtn()?.nativeElement.focus()` callback. This plugin does not patch that handler. Subtask creation and persistence through Close/reopen are tested; that separate native Escape path is not claimed fixed.

Physical Android, native Electron window controls, other browser engines, every third-party theme and future app versions are not verified. The added Close button/dialog accessibility labels are currently English; the editor's own translations are unchanged.

## Build from source

Requires Python 3 for packaging and tests; Deno 2 for formatting/JavaScript checks. From the repository root:

```sh
deno fmt --check src/ tests/lifecycle.mjs
deno check src/plugin.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 build.py
python3 -m zipfile -t dist/task-details-popup.zip
```

Install `dist/task-details-popup.zip` as above. The [CI workflow](.github/workflows/release.yml) follows the companion plugins: pushes to `main` and pull requests run offline checks and build an artifact; a pushed version tag publishes a GitHub Release after those checks pass. Tags must match `src/manifest.json`, for example `v0.2.5`. CI does **not** run the optional installed-app browser suite below.

The ZIP contains exactly **`manifest.json` and `plugin.js`** at its root. CSS is bundled into `plugin.js`. There are no runtime npm dependencies or external resources.

Optional Deno formatting/syntax checks:

```sh
npm exec --yes --package=deno -- deno fmt --check src/ tests/lifecycle.mjs
node --check src/plugin.js
```

## Browser verification

The isolated lifecycle check exercises the real plugin code against a small native-panel DOM fixture. It covers duplicate execution, stale unload callbacks, disabling during an edit, retiring-panel cleanup, rapid reopen, skipping hidden hover controls during Tab wrapping, and restoration of original DOM. It is **not** a substitute for app integration tests.

```sh
# Point these at your optional Playwright installation and matching browsers.
PLAYWRIGHT_MODULE="$PWD/dist/browser-tools/node_modules/playwright/index.mjs" \
PLAYWRIGHT_BROWSERS_PATH="$PWD/dist/browser-tools/browsers" \
  node tests/lifecycle.mjs
```

The installed-plugin checks use upstream's existing E2E harness, isolated disposable browser contexts, and the **actual ZIP upload/enable UI**. The `.spec.ts.in` file is a test template: the runner temporarily copies it into the upstream E2E directory so its fixture imports resolve, runs upstream's format/lint checks, and removes it in `finally`. It refuses the earlier modified panel sources using stored baseline hashes. **No runtime app source is changed.** Run one instance at a time per upstream checkout.

From this repository root, with a clean upstream checkout at the pinned commit, its development dependencies, matching Playwright browsers and unmodified web build available:

```sh
KANBAN_PLUGIN_ZIP="/path/to/project-kanban.zip" \
  python3 tests/run_host_tests.py --host-source /path/to/super-productivity
```

`KANBAN_PLUGIN_ZIP` can override the path to the separate Kanban ZIP; by default it uses the sibling `dist/project-kanban.zip` of that existing checkout. `--baseline --grep light` reproduces the original missing-popup failure without installing this plugin. `--web-root <directory> --host-version 19.1.0` tests unchanged released web assets with the same harness. The runner starts a loopback-only HTTP server on an available port and **always shuts it down after the run**, including failures. Users do not run this server to use the plugin.

### Executed results

- Packaging: **2 tests passed**.
- Isolated browser lifecycle regression: **passed** (was observed failing before duplicate-instance cleanup was added).
- Actual plugin installation/application tests: **31 passed on released 19.1.0 assets** and **31 passed on clean 19.3.1**, with no retries.
- Title-frame regression: observed failing before both frame fixes; verifies all four outer borders and their colours at rest, during editing and after blur, no painted inner title border/background/shadow/outline, no extra textarea outline, stable horizontal geometry, and native title saving. Editing screenshots are saved as `dist/popup-<version>-<appearance>-title.png`.
- Content-height regression: observed the old 244px footer gap before the fix. Verifies a compact footer gap and no unnecessary vertical scrolling with short content, then fills 40 lines through the native editor, checks capped height/scrolling, reaches the creation-date footer and checks the footer and Close control remain reachable in an 844×390 landscape viewport.
- Symmetric-inset regression: observed the old 15px left/right difference before the fix. Checks matching card insets in light/dark/Todoist appearances at 1280px, 844px and 600px, plus a long note with active scrolling.
- The border/layout/hover regressions were observed failing against v0.2.0 before the fix. The new checks compare focused card borders/backgrounds and editor outlines against the native styles with the plugin stylesheet disabled, check all four card borders and lateral focus-ring clearance, and repeatedly hover at 1280px, 844px and 600px without moving field/value geometry or introducing horizontal overflow. Tested in native light/dark appearances and with the **actual published Todoist Dark v0.1.0 stylesheet**, not only replacement colour tokens. The stylesheet is a pinned, MIT-licensed test fixture; it is not bundled or required. See `tests/fixtures/README.md` for source/hash/license and test boundaries.
- Other coverage: frame-by-frame opening/closing geometry and page-width stability, rapid reopen, native stacked layout, native subtask creation/Close/reopen, native List popup, actual Kanban plugin and card focus, title persistence/reload, live/plain/fullscreen notes, nested schedule Escape, Tab containment, browser Back, disable restoration, unchanged project Notes sidebar, custom colours, 599/600px transitions, phone portrait/landscape and tablet touch UI.
- The initial List test was observed failing on the unmodified app without the plugin. Plugin source syntax/format, generated spec lint and ZIP integrity checks pass.

Successful app screenshots are saved to `dist/popup-<version>-light.png`, `dist/popup-<version>-dark.png` and `dist/popup-<version>-<appearance>-focus.png` (including `todoist`). `tests/upstream-baseline.json` identifies the unmodified source fixture; `tests/released-web.json` records the official release asset provenance. Build/download artifacts and screenshots are ignored, not plugin source.

This project ships only the plugin. Verification uses isolated disposable app profiles, not an existing installed application or personal task data. Licensed under [MIT](LICENSE).
