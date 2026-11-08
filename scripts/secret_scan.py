#!/usr/bin/env python3
"""Fail closed on likely credentials in staged blobs or Git history; never print values.

Local guardrail, not a replacement for server-side secret scanning or rotation.
"""

import argparse
import re
import subprocess
import sys


BLOCKED_NAMES = re.compile(
    r"(^|/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|auth\.json|"
    r"credentials\.json|secrets\.json|id_(?:rsa|ed25519)(?:\..*)?|"
    r"[^/]+\.(?:pem|key|p12|pfx|jks|keystore|sqlite|db|secret|secrets))$",
    re.IGNORECASE,
)
PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
    "OpenAI token": re.compile(rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "Slack token": re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}"),
    "JWT": re.compile(rb"\beyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{10,}"),
    "credentials in URL": re.compile(rb"https?://[^\s/:@]{2,}:[^\s/@]{8,}@[A-Za-z0-9.-]+"),
    "credential assignment": re.compile(
        rb"(?i)(?:access_token|refresh_token|client_secret|api[_-]?key|password)\s*[=:]\s*"
        rb"[\"'][^\"'\r\n]{20,}[\"']"
    ),
}
MAX_BYTES = 2 * 1024 * 1024


def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL)


def staged():
    for row in git("ls-files", "--stage", "-z").split(b"\0"):
        if not row:
            continue
        meta, path = row.split(b"\t", 1)
        mode, oid, stage = meta.split(b" ")
        if stage != b"0":
            raise ValueError("unmerged index entry")
        if mode != b"160000":  # submodules have no local blob to inspect
            yield oid.decode(), path.decode("utf-8", "replace")


def history(tip):
    # Scan *every* commit reachable from the pushed tip, including old commits.
    # No chance of missing a secret that was deleted in a later commit.
    commits = git("rev-list", tip).decode().splitlines()
    seen = set()
    for commit in commits:
        for row in git("ls-tree", "-r", "-z", commit).split(b"\0"):
            if not row:
                continue
            meta, path = row.split(b"\t", 1)
            mode, kind, oid = meta.split(b" ")
            if kind != b"blob" or mode == b"160000":
                continue
            item = (oid.decode(), path.decode("utf-8", "replace"))
            if item not in seen:
                seen.add(item)
                yield item


def scan(entries):
    failures = 0
    seen = set()
    for oid, path in entries:
        if (oid, path) in seen:
            continue
        seen.add((oid, path))
        if BLOCKED_NAMES.search(path):
            print(f"BLOCKED filename: {path}", file=sys.stderr)
            failures += 1
            continue
        size = int(git("cat-file", "-s", oid))
        if size > MAX_BYTES:
            print(f"BLOCKED oversized blob ({size} bytes): {path}", file=sys.stderr)
            failures += 1
            continue
        data = git("cat-file", "blob", oid)
        for name, pattern in PATTERNS.items():
            if pattern.search(data):
                print(f"BLOCKED possible {name}: {path}", file=sys.stderr)
                failures += 1
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--staged", action="store_true")
    group.add_argument("--history", metavar="REV")
    args = parser.parse_args()
    try:
        failures = scan(staged() if args.staged else history(args.history))
    except (subprocess.CalledProcessError, ValueError) as exc:
        print(f"Secret scan could not complete: {type(exc).__name__}", file=sys.stderr)
        return 1
    if failures:
        print(f"Secret scan blocked {failures} issue(s). No secret values were printed.", file=sys.stderr)
        return 1
    print("Secret scan passed (heuristic, not a guarantee).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
