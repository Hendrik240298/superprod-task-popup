"""Run installed-plugin tests on a clean upstream web build; stop server in finally."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import threading

ROOT = Path(__file__).absolute().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host-source", type=Path, required=True)
    parser.add_argument("--web-root", type=Path, help="Optional unmodified released web assets")
    parser.add_argument("--host-version", default="19.3.1", help="Version of the served app (not the test harness)")
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--grep")
    args = parser.parse_args()
    host = args.host_source.absolute()
    baseline = json.loads((ROOT / "tests/upstream-baseline.json").read_text())
    for entry in baseline["source_files"]:
        actual = hashlib.sha256((host / entry["path"]).read_bytes()).hexdigest()
        assert actual == entry["sha256"], f"Patched host is not allowed: {entry['path']}"
    assert not (host / "src/app/features/right-panel/task-details-dialog.component.ts").exists()
    web = args.web_root.absolute() if args.web_root else host / "dist/browser"
    assert (web / "index.html").is_file(), "Build the unmodified upstream web app first"
    spec = host / "e2e/tests/plugins/task-details-popup-external.spec.ts"
    assert not spec.exists(), f"Refusing to overwrite {spec}"
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(web)))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = dict(os.environ, E2E_BASE_URL=f"http://127.0.0.1:{server.server_port}",
               E2E_WORKERS="2", POPUP_PLUGIN_ZIP=str(ROOT / "dist/task-details-popup.zip"),
               KANBAN_PLUGIN_ZIP=os.environ.get("KANBAN_PLUGIN_ZIP", str(host.parent / "project-kanban.zip")),
               POPUP_HOST_VERSION=args.host_version,
               POPUP_SCREENSHOT_DIR=str(ROOT / "dist"),
               POPUP_TODOIST_THEME_CSS=str(ROOT / "tests/fixtures/todoist-dark.css"),
               POPUP_BASELINE="1" if args.baseline else "0")
    command = ["npm", "run", "quiet", "--", "e2e:file", str(spec.relative_to(host)), "--retries=0"]
    if args.grep:
        command += ["--grep", args.grep]
    try:
        shutil.copyfile(ROOT / "tests/host-popup.spec.ts.in", spec)
        check = subprocess.run(["npm", "run", "quiet", "--", "checkFile", str(spec.relative_to(host))],
                               cwd=host, env=env, check=False)
        if check.returncode:
            return check.returncode
        print(f"Testing unmodified app {args.host_version} at {env['E2E_BASE_URL']} (fixture source {baseline['upstream_commit']})", flush=True)
        return subprocess.run(command, cwd=host, env=env, check=False).returncode
    finally:
        spec.unlink(missing_ok=True)
        server.shutdown()
        server.server_close()
        thread.join()
        print("Test HTTP server stopped; temporary upstream spec removed.", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
