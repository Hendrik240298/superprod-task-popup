"""Build a flat ZIP installable through Super Productivity Settings > Plugins."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).parent


def build():
    source = ROOT / "src"
    code = (source / "plugin.js").read_text(encoding="utf-8")
    marker = '/* INLINE_CSS */ ""'
    assert code.count(marker) == 1, "Expected exactly one CSS insertion point"
    code = code.replace(marker, json.dumps((source / "style.css").read_text(encoding="utf-8")))
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["iFrame"] is False
    files = {"manifest.json": json.dumps(manifest, indent=2) + "\n", "plugin.js": code}
    out = ROOT / "dist/task-details-popup.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, contents in files.items():
            archive.writestr(name, contents)
    return out


if __name__ == "__main__":
    print(build())
