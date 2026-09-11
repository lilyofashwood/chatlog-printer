#!/usr/bin/env python3
"""Serve the local demo on loopback only; no package installation needed."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
from urllib.parse import urlsplit


PUBLIC = {"/", "/index.html", "/demo.css", "/demo.js", "/store.js", "/render.js",
          "/archive.html", "/archive.css", "/archive.js", "/transcript.html",
          "/transcript.css", "/transcript.js", "/icons/icon-48.png",
          "/presentation.js", "/presentation.css"}


class DemoHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        # An orphaned/disconnected terminal must not break HTTP responses.
        pass

    def send_head(self):
        port = self.server.server_port
        if self.headers.get_all("Host") not in ([f"127.0.0.1:{port}"], [f"localhost:{port}"]):
            self.send_error(403, "Use the printed loopback URL")
            return None
        path = urlsplit(self.path).path
        if path not in PUBLIC:
            self.send_error(404, "Not a demo asset")
            return None
        file = Path(self.directory) / ("index.html" if path == "/" else path.lstrip("/"))
        if any(item.is_symlink() for item in (file, *file.parents)):
            self.send_error(404, "Not a demo asset")
            return None
        return super().send_head()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(DemoHandler, directory=str(root)))
    print(f"Chatlog Printer demo: http://127.0.0.1:{server.server_port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
