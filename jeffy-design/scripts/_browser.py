"""浏览器定位：与 lib/browser.mjs 的 findChrome 保持同一套查找顺序。"""
from __future__ import annotations
import os
from pathlib import Path
from glob import glob


def _candidates():
    env = os.environ.get("CHROME_PATH")
    if env:
        yield Path(env)
    roots = [
        os.environ.get("PLAYWRIGHT_BROWSERS_PATH"),
        str(Path.home() / ".cache" / "ms-playwright"),
    ]
    for root in roots:
        if not root:
            continue
        patterns = [
            "chromium-*/chrome-linux64/chrome",
            "chromium-*/chrome-linux/chrome",
            "chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell",
        ]
        for pattern in patterns:
            for hit in sorted(glob(str(Path(root) / pattern))):
                yield Path(hit)
    for system in ("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"):
        yield Path(system)


def find_chrome() -> str:
    for path in _candidates():
        if path and path.is_file() and os.access(path, os.X_OK):
            return str(path)
    raise RuntimeError(
        "找不到 Chromium。安装方式：npx playwright install chromium，或设置 CHROME_PATH 指向浏览器可执行文件。"
    )
