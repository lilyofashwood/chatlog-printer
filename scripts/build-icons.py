#!/usr/bin/env python3
"""Build the original paper-mark icons with only Python's standard library."""

from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parent.parent


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def icon(size):
    # Four-times sampling keeps the simple, code-authored mark crisp at toolbar sizes.
    scale = 4
    palette = {"background": (246, 241, 231, 255), "ink": (32, 32, 29, 255), "paper": (255, 253, 248, 255), "accent": (167, 71, 39, 255)}
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = []
            for dy in range(scale):
                for dx in range(scale):
                    sx = (x + (dx + .5) / scale) / size
                    sy = (y + (dy + .5) / scale) / size
                    color = palette["background"]
                    if .18 <= sx < .82 and .12 <= sy < .88:
                        color = palette["ink"]
                        if .215 <= sx < .785 and .155 <= sy < .845:
                            color = palette["paper"]
                    if .31 <= sx < .69 and any(top <= sy < top + .045 for top in (.31, .45, .59)):
                        color = palette["accent"] if sy < .36 else palette["ink"]
                    samples.append(color)
            rows.extend(round(sum(sample[channel] for sample in samples) / len(samples)) for channel in range(4))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + png_chunk(b"IEND", b"")


if __name__ == "__main__":
    folder = ROOT / "icons"
    folder.mkdir(exist_ok=True)
    for dimension in (16, 32, 48, 128):
        (folder / f"icon-{dimension}.png").write_bytes(icon(dimension))
    print("Built original paper-mark icons at 16, 32, 48, and 128 pixels.")
