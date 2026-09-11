#!/usr/bin/env python3
"""Create a deterministic, allowlisted extension ZIP and matching unpacked folder."""

from pathlib import Path
import hashlib
import json
import shutil
import zipfile


ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "manifest.json", "background.js", "capture-core.js", "page-capture.js", "store.js", "render.js",
    "popup.html", "popup.css", "popup.js", "archive.html", "archive.css", "archive.js",
    "transcript.html", "transcript.css", "transcript.js", "PRIVACY.md", "LICENSE", "ACKNOWLEDGEMENTS.md",
    "presentation.js", "presentation.css",
    "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
)


def main():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    dist = ROOT / "dist"
    unpacked = dist / f"chatlog-printer-{version}"
    archive = dist / f"chatlog-printer-{version}.zip"
    unpacked.mkdir(parents=True, exist_ok=True)
    extras = [str(path.relative_to(unpacked)) for path in unpacked.rglob("*") if path.is_file() and str(path.relative_to(unpacked)) not in FILES]
    if extras:
        raise RuntimeError(f"Unexpected files in existing output directory; refusing an ambiguous package: {extras}")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name in FILES:
            source = ROOT / name
            if not source.is_file() or source.is_symlink():
                raise RuntimeError(f"Missing or symlinked release file: {name}")
            destination = unpacked / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, source.read_bytes())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / "SHA256SUMS").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Unpacked: {unpacked}\nZIP: {archive}\nSHA-256: {digest}\nFiles: {len(FILES)} (no tests, demo, scripts, or development files)")


if __name__ == "__main__":
    main()
