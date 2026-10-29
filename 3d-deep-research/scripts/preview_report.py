#!/usr/bin/env python3
"""Render PDF pages with Poppler and make bounded contact sheets."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from report_artifacts import sha256


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pdftoppm", default="pdftoppm")
    args = parser.parse_args()
    from PIL import Image, ImageDraw

    poppler = shutil.which(args.pdftoppm)
    if not poppler:
        raise SystemExit(f"pdftoppm not found: {args.pdftoppm}")
    args.output.mkdir(parents=True, exist_ok=True)
    key = {"pdf_sha256": sha256(args.pdf), "script_sha256": sha256(Path(__file__)),
           "poppler_sha256": sha256(Path(poppler))}
    index_path = args.output / "index.json"
    if index_path.is_file():
        old = json.loads(index_path.read_text(encoding="utf-8"))
        if old.get("inputs") == key and old.get("files") and all(
            (args.output / name).is_file() and sha256(args.output / name) == digest
            for name, digest in old["files"].items()
        ):
            print(f"[OK] Preview reused: {index_path}; visual review remains pending.")
            return
    # Temporary pages prevent stale pages from a longer previous PDF entering sheets.
    with tempfile.TemporaryDirectory(prefix="report-preview-") as directory:
        staging = Path(directory)
        subprocess.run([poppler, "-scale-to", "1400", "-png", str(args.pdf.resolve()), str(staging / "page")], check=True, timeout=300)
        pages = sorted(staging.glob("page-*.png"))
        if not pages:
            raise RuntimeError("Poppler produced no preview pages")
        files = list(pages)
        for offset in range(0, len(pages), 12):
            group = pages[offset:offset + 12]
            sheet = Image.new("RGB", (1200, ((len(group) + 2) // 3) * 590), "#dedede")
            draw = ImageDraw.Draw(sheet)
            for i, page in enumerate(group):
                with Image.open(page) as image:
                    image.thumbnail((384, 550))
                    x, y = (i % 3) * 400, (i // 3) * 590
                    sheet.paste(image, (x + 8, y + 28))
                    draw.text((x + 12, y + 6), f"Page {offset + i + 1}", fill="black")
            contact = staging / f"contact-{offset // 12 + 1:02d}.png"
            sheet.save(contact)
            files.append(contact)
        if sha256(args.pdf) != key["pdf_sha256"]:
            raise RuntimeError("PDF changed while generating previews; run again")
        for path in files:
            shutil.copy2(path, args.output / path.name)
        data = {"inputs": key, "pages": len(pages), "files": {path.name: sha256(path) for path in files}}
        index_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"[OK] Preview: {index_path} ({len(pages)} pages); inspect contact sheets and representative full pages.")


if __name__ == "__main__":
    main()
