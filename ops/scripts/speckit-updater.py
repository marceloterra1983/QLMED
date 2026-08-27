#!/usr/bin/env python3
"""Authenticated local updater used by the n8n Spec Kit workflow."""

from __future__ import annotations

import datetime as dt
import hmac
import json
import os
import re
import subprocess
import threading
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


# Bind docker0 by default so n8n (host.docker.internal→172.17.0.1) works
# without exposing the webhook on Tailscale/LAN (0.0.0.0).
# Empty SPECKIT_HOST is refused (Python would bind all interfaces).
_DEFAULT_HOST = "172.17.0.1"
_raw_host = os.environ.get("SPECKIT_HOST")
if _raw_host is None:
    HOST = _DEFAULT_HOST
else:
    HOST = _raw_host.strip()
    if not HOST:
        raise RuntimeError(
            "SPECKIT_HOST is empty; omit it to use 172.17.0.1 or set an explicit IP"
        )
PORT = int(os.environ.get("SPECKIT_PORT", "8765"))
SECRET = os.environ.get("SPECKIT_WEBHOOK_SECRET", "")
VENV = Path("/home/marce/.local/share/specify-cli")
SPECIFY = VENV / "bin" / "specify"
PIP = VENV / "bin" / "pip"
VERSION_PATTERN = re.compile(r"\b(\d+\.\d+\.\d+)\b")
TAG_PATTERN = re.compile(r"^v\d+\.\d+\.\d+$")
update_lock = threading.Lock()

if len(SECRET) < 32:
    raise RuntimeError("SPECKIT_WEBHOOK_SECRET is missing")


def run(command: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        check=False,
        text=True,
        capture_output=True,
        timeout=timeout,
        env={**os.environ, "HOME": "/home/marce"},
    )


def installed_version() -> str:
    if not SPECIFY.is_file():
        return ""
    result = run([str(SPECIFY), "version"])
    match = VERSION_PATTERN.search(result.stdout + result.stderr)
    return match.group(1) if match else ""


def latest_tag() -> str:
    request = urllib.request.Request(
        "https://api.github.com/repos/github/spec-kit/releases/latest",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "QLMED-SpecKit-Updater/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        tag = str(json.load(response).get("tag_name") or "")
    if not TAG_PATTERN.fullmatch(tag):
        raise RuntimeError("latest release did not return a valid version tag")
    return tag


def update(mode: str) -> dict:
    before = installed_version()
    target_tag = latest_tag()
    target = target_tag.removeprefix("v")
    timestamp = dt.datetime.now(dt.UTC).isoformat()

    if before == target:
        return {
            "result": "up-to-date",
            "installed_version": before,
            "target_version": target,
            "timestamp": timestamp,
        }
    if mode != "apply":
        return {
            "result": "update-available",
            "installed_version": before or "not-installed",
            "target_version": target,
            "timestamp": timestamp,
        }
    if not PIP.is_file():
        raise RuntimeError("Spec Kit virtual environment is missing")

    result = run(
        [
            str(PIP),
            "install",
            "--upgrade",
            "--force-reinstall",
            f"git+https://github.com/github/spec-kit.git@{target_tag}",
        ],
        timeout=600,
    )
    after = installed_version()
    if result.returncode != 0 or after != target:
        detail = (result.stderr or result.stdout or "upgrade failed")[-1000:]
        raise RuntimeError(detail)
    return {
        "result": "upgraded",
        "installed_version": after,
        "target_version": target,
        "previous_version": before or "not-installed",
        "timestamp": timestamp,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "QLMED-SpecKit-Updater/1.0"

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/healthz":
            self.send_json(HTTPStatus.NOT_FOUND, {"status": "not_found"})
            return
        self.send_json(
            HTTPStatus.OK,
            {
                "status": "ok",
                "service": "speckit-updater",
                "installed_version": installed_version() or "not-installed",
            },
        )

    def do_POST(self) -> None:
        if self.path != "/speckit/update":
            self.send_json(HTTPStatus.NOT_FOUND, {"status": "not_found"})
            return
        supplied = self.headers.get("X-Webhook-Secret", "")
        if not supplied or not hmac.compare_digest(supplied, SECRET):
            self.send_json(HTTPStatus.UNAUTHORIZED, {"status": "unauthorized"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length < 0 or content_length > 4096:
            self.send_json(HTTPStatus.BAD_REQUEST, {"status": "invalid_body"})
            return
        try:
            payload = json.loads(self.rfile.read(content_length) or b"{}")
            mode = str(payload.get("mode") or "check")
            if mode not in {"check", "apply"}:
                raise ValueError("mode must be check or apply")
            if not update_lock.acquire(blocking=False):
                self.send_json(
                    HTTPStatus.CONFLICT,
                    {"result": "error", "detail": "update already running"},
                )
                return
            try:
                result = update(mode)
            finally:
                update_lock.release()
            self.send_json(HTTPStatus.OK, result)
        except Exception as error:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "result": "error",
                    "detail": str(error)[-1000:],
                    "timestamp": dt.datetime.now(dt.UTC).isoformat(),
                },
            )

    def log_message(self, message: str, *args: object) -> None:
        print(f"{self.address_string()} {message % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
