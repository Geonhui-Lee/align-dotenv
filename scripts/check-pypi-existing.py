#!/usr/bin/env python3
"""Read-only immutable PyPI recovery guard for the exact validated distributions."""
import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

version = os.environ["RELEASE_TAG"].removeprefix("v")
try:
    with urllib.request.urlopen(f"https://pypi.org/pypi/align-dotenv/{version}/json", timeout=30) as response:
        published = json.load(response)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    published = None
if published:
    remote = {item["filename"]: item["digests"]["sha256"] for item in published["urls"]}
    local = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in Path("dist").iterdir() if path.is_file()}
    assert local == remote and published["info"]["version"] == version, "existing PyPI files differ; stop, never republish"
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
    stream.write(f'already_published={"true" if published else "false"}\n')
