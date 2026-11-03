"""Package only known extension files. Run with Python 3.9+."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
extension = root / "extension"
manifest = json.loads((extension / "manifest.json").read_text())
files = ["manifest.json", "anchor.js", "background.js", "model.mjs", "panel.html",
         "panel.mjs", "ui.css", "setup.html", "setup.js", "setup.css", *manifest["icons"].values()]
target = root / "dist" / f"otvet-ryadom-{manifest['version']}.zip"
target.parent.mkdir(exist_ok=True)
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(extension / name, name)
with ZipFile(target) as archive:
    assert archive.testzip() is None
print(target)

cloud = root / "cloud"
cloud_manifest = json.loads((cloud / "manifest.json").read_text())
cloud_target = target.parent / f"otvet-ryadom-cloud-{cloud_manifest['version']}.zip"
with ZipFile(cloud_target, "w", ZIP_DEFLATED) as archive:
    for name in ["manifest.json", "panel.html", "panel.mjs", "model.mjs", "ui.css",
                 "setup.html", "setup.js", "setup.css", *cloud_manifest["icons"].values()]:
        archive.write(cloud / name, name)
print(cloud_target)
