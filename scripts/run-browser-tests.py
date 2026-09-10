#!/usr/bin/env python3
"""Run the browser suite and wait for its asynchronous IndexedDB checks."""

from __future__ import annotations

import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import URLError
from urllib.parse import quote, unquote
from urllib.request import Request, urlopen


PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RESULT_PREFIX = "CHATLOG_TESTS:"
SMOKE_RESULT_PREFIX = "CHATLOG_EXTENSION_SMOKE:"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        pass


def read_devtools_port(profile_dir: Path, deadline: float) -> int:
    port_file = profile_dir / "DevToolsActivePort"
    while time.monotonic() < deadline:
        try:
            return int(port_file.read_text(encoding="utf-8").splitlines()[0])
        except (FileNotFoundError, IndexError, ValueError):
            time.sleep(0.05)
    raise RuntimeError("Chrome did not expose its test control port in time.")


def devtools_targets(port: int) -> list[dict[str, object]]:
    with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=1) as response:
        return json.load(response)


def find_extension_id(profile_dir: Path, deadline: float) -> str:
    project_path = PROJECT_DIR.resolve()
    preference_paths = [profile_dir / "Default" / "Preferences", profile_dir / "Default" / "Secure Preferences"]
    while time.monotonic() < deadline:
        for preference_path in preference_paths:
            try:
                preferences = json.loads(preference_path.read_text(encoding="utf-8"))
                settings = preferences.get("extensions", {}).get("settings", {})
                for extension_id, setting in settings.items():
                    configured_path = setting.get("path")
                    if configured_path and Path(configured_path).resolve() == project_path:
                        return extension_id
            except (FileNotFoundError, OSError, json.JSONDecodeError, TypeError):
                pass
        time.sleep(0.05)
    raise RuntimeError("Chrome did not register the unpacked Chatlog Printer extension.")


def open_target(port: int, url: str) -> None:
    request = Request(
        f"http://127.0.0.1:{port}/json/new?{quote(url, safe='')}",
        method="PUT",
    )
    with urlopen(request, timeout=2):
        pass


def read_result(port: int, deadline: float, require_smoke: bool) -> tuple[str, str]:
    test_result: tuple[str, str] | None = None
    smoke_result: tuple[str, str] | None = None
    last_targets: list[str] = []
    while time.monotonic() < deadline:
        try:
            targets = devtools_targets(port)
            last_targets = [f"{target.get('type')}: {target.get('title')} [{target.get('url')}]" for target in targets]
            for target in targets:
                if "/tests/browser-tests.html" not in str(target.get("url", "")):
                    title = str(target.get("title", ""))
                    if title.startswith(SMOKE_RESULT_PREFIX):
                        _prefix, status, encoded = title.split(":", 2)
                        smoke_result = status, unquote(encoded)
                    continue
                title = str(target.get("title", ""))
                if title.startswith(RESULT_PREFIX):
                    _prefix, status, encoded = title.split(":", 2)
                    test_result = status, unquote(encoded)
            if test_result and not require_smoke:
                return test_result[0], f"{test_result[1]}\nSKIP unpacked-extension smoke (branded Google Chrome 137+ disables --load-extension; use Chromium or Chrome for Testing)."
            if test_result and smoke_result:
                smoke_status, smoke_details = smoke_result
                combined_details = f"{test_result[1]}\n{smoke_details}"
                return ("pass" if test_result[0] == "pass" and smoke_status == "pass" else "fail"), combined_details
        except (OSError, URLError, json.JSONDecodeError, ValueError):
            pass
        time.sleep(0.05)
    state = f"unit={'ready' if test_result else 'missing'}, extension-smoke={'ready' if smoke_result else 'missing'}"
    targets_text = "\n".join(last_targets[-8:]) or "No DevTools targets were visible."
    raise RuntimeError(f"The browser or unpacked-extension smoke suite did not finish in time ({state}).\n{targets_text}")


def main() -> int:
    chrome = Path(os.environ.get("CHATLOG_CHROME_BIN", DEFAULT_CHROME))
    if not chrome.is_file() or not os.access(chrome, os.X_OK):
        print(f"Chrome was not found at: {chrome}", file=sys.stderr)
        print("Set CHATLOG_CHROME_BIN to a Chromium-compatible browser executable.", file=sys.stderr)
        return 1

    try:
        version_result = subprocess.run(
            [str(chrome), "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        browser_version = (version_result.stdout or version_result.stderr).strip()
    except (OSError, subprocess.TimeoutExpired):
        browser_version = ""
    supports_extension_smoke = not (
        browser_version.startswith("Google Chrome ")
        and "Chrome for Testing" not in browser_version
    )

    def handler(*args: object, **kwargs: object) -> QuietHandler:
        return QuietHandler(*args, directory=str(PROJECT_DIR), **kwargs)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        with tempfile.TemporaryDirectory(prefix="chatlog-printer-test-") as profile:
            profile_dir = Path(profile)
            test_url = f"http://127.0.0.1:{server.server_port}/tests/browser-tests.html"
            with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as chrome_log:
                chrome_arguments = [
                    str(chrome),
                    "--headless=new",
                    "--disable-gpu",
                    "--disable-background-networking",
                    "--disable-component-update",
                    "--no-first-run",
                    "--remote-debugging-port=0",
                    f"--user-data-dir={profile_dir}",
                    test_url,
                ]
                if supports_extension_smoke:
                    chrome_arguments[6:6] = [
                        f"--disable-extensions-except={PROJECT_DIR}",
                        f"--load-extension={PROJECT_DIR}",
                    ]
                process = subprocess.Popen(
                    chrome_arguments,
                    stdout=subprocess.DEVNULL,
                    stderr=chrome_log,
                )
                try:
                    deadline = time.monotonic() + 20
                    port = read_devtools_port(profile_dir, deadline)
                    if supports_extension_smoke:
                        extension_id = find_extension_id(profile_dir, deadline)
                        open_target(port, f"chrome-extension://{extension_id}/tests/extension-smoke.html")
                    status, details = read_result(port, deadline, supports_extension_smoke)
                    print(details)
                    return 0 if status == "pass" else 1
                except RuntimeError:
                    chrome_log.seek(0)
                    diagnostics = chrome_log.read().strip()
                    if diagnostics:
                        print(diagnostics[-4000:], file=sys.stderr)
                    raise
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
