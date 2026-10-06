#!/usr/bin/env python3
"""Attach an already-validated candidate to an existing release; never create one."""
import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("bundle", type=Path)
args = parser.parse_args()
assert os.environ.get("RELEASE_PUBLISH_AUTHORIZED") == "true", "protected publication opt-in required"
tag = os.environ["RELEASE_TAG"]
manifest = json.loads((args.bundle / "BUILD_METADATA.json").read_text())
assert tag == manifest["tag"] and os.environ["EXPECTED_COMMIT"] == manifest["sourceCommit"], "release identity mismatch"
assert all(manifest["releasePolicy"][key] is True for key in ("licensingAuditComplete", "externalNpmSetupConfirmed", "protectedEnvironmentsConfirmed")), "release prerequisites unresolved"
release = json.loads(subprocess.check_output(["gh", "release", "view", tag, "--json", "isDraft,isPrerelease,assets"], text=True))
assert not release["isDraft"] and not release["isPrerelease"], "published stable release required"
expected = [entry["filename"] for entry in manifest["binaries"]] + ["SHA256SUMS", "BUILD_METADATA.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]
existing = {asset["name"] for asset in release["assets"]}
missing = []
with tempfile.TemporaryDirectory(prefix="align-release-assets-") as temp:
    for name in expected:
        path = args.bundle / name
        assert path.is_file(), "missing release asset"
        if name in existing:
            subprocess.run(["gh", "release", "download", tag, "--pattern", name, "--dir", temp], check=True)
            assert (Path(temp) / name).read_bytes() == path.read_bytes(), "existing release asset mismatch; do not overwrite"
        else:
            missing.append(path)
    for path in missing:
        subprocess.run(["gh", "release", "upload", tag, str(path)], check=True)
