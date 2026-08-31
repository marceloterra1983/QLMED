#!/usr/bin/env python3
"""Prove a QLMED CI job cannot reach production surfaces (SPEC-013 SC-003)."""

from __future__ import annotations

import os
import re
import socket
import sys
from pathlib import Path

TIMEOUT_SECONDS = 1.0

# Production compose `qlmed_network` (172.18.0.0/16) plus other runner-slot
# gateways. Own slot-4 gateway 10.254.3.1 is included: Postgres on the host
# must not answer there. TCP success is a failure of isolation.
QLMED_CI_RUNNER = re.compile(r"^qlmed-ci-linux-\d{2}$")

TCP_TARGETS: tuple[tuple[str, int, str], ...] = (
    ("172.18.0.3", 5432, "qlmed-db"),
    ("172.18.0.6", 5678, "qlmed-n8n"),
    ("172.18.0.7", 3000, "qlmed-app"),
    ("172.18.0.1", 5432, "qlmed_network gateway"),
) + tuple(
    (f"10.254.{octet}.1", 5432, f"slot-{octet + 1} gateway")
    for octet in range(12)
)

HOST_PATHS: tuple[tuple[Path, str], ...] = (
    (Path("/var/run/docker.sock"), "host docker.sock"),
    (Path("/home/marce"), "host home"),
    (Path("/home/marce/qlmed"), "production tree"),
    (Path("/srv/qlmed"), "host /srv/qlmed"),
    (Path("/srv/backups"), "host /srv/backups"),
    (Path("/srv/data1"), "host /srv/data1"),
    (Path("/srv/data2"), "host /srv/data2"),
)


def _mounted(path: Path) -> bool:
    target = str(path)
    try:
        lines = Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    return any(len(parts) >= 5 and parts[4] == target for parts in (line.split() for line in lines))


def main() -> int:
    failures: list[str] = []

    runner = os.environ.get("RUNNER_NAME", "")
    if not QLMED_CI_RUNNER.fullmatch(runner):
        failures.append(f"runner_name={runner!r} is not qlmed-ci-linux-NN")

    for host, port, label in TCP_TARGETS:
        try:
            with socket.create_connection((host, port), TIMEOUT_SECONDS) as conn:
                failures.append(f"reachable {label} {host}:{port} peer={conn.getpeername()}")
        except OSError:
            print(f"blocked {label} {host}:{port}")

    srv = Path("/srv")
    if _mounted(srv):
        failures.append("/srv is a mount from the host")
    else:
        print("/srv is not a host mount")

    for path, label in HOST_PATHS:
        if path.exists():
            failures.append(f"host path visible: {label} ({path})")
        else:
            print(f"absent {label}")

    if failures:
        for item in failures:
            print(f"ISOLATION FAIL: {item}", file=sys.stderr)
        return 1

    print("CI isolation policy OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
