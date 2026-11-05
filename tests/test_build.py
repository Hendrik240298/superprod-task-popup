"""Packaging checks; no server, npm install or external services needed."""
from pathlib import Path
import importlib.util
import json
import unittest
import zipfile

ROOT = Path(__file__).absolute().parents[1]
spec = importlib.util.spec_from_file_location("popup_build", ROOT / "build.py")
assert spec is not None and spec.loader is not None
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BuildTests(unittest.TestCase):
    def test_flat_installable_plugin_has_bundled_css_and_no_app(self):
        archive_path = builder.build()
        with zipfile.ZipFile(archive_path) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(sorted(archive.namelist()), ["manifest.json", "plugin.js"])
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["id"], "task-details-popup")
            self.assertFalse(manifest["iFrame"])
            self.assertEqual(manifest["permissions"], [])
            self.assertEqual(manifest["dataSharing"], [])
            code = archive.read("plugin.js").decode()
            css = (ROOT / "src/style.css").read_text()
            self.assertIn(json.dumps(css), code)
            self.assertNotIn('/* INLINE_CSS */ ""', code)
            self.assertNotIn("http://", code)
            self.assertNotIn("https://", code)

    def test_manifest_and_sources_are_readable_and_consistent(self):
        manifest = json.loads((ROOT / "src/manifest.json").read_text())
        self.assertEqual(manifest["version"], "0.2.5")
        self.assertEqual(manifest["minSupVersion"], "19.1.0")
        self.assertEqual((ROOT / "src/plugin.js").read_text().count('/* INLINE_CSS */ ""'), 1)
        self.assertTrue((ROOT / "src/style.css").read_text().startswith("/*"))


if __name__ == "__main__":
    unittest.main()
