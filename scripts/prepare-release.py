#!/usr/bin/env python3
"""Assemble, but never publish, exact same-commit validated native artifacts."""
import argparse
import base64
import hashlib
import json
import shutil
import struct
import subprocess
import tarfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def members(path):
    with tarfile.open(path, "r:gz") as archive:
        result = {}
        for entry in archive.getmembers():
            assert entry.isfile() and entry.name.startswith("package/"), "non-regular npm member"
            name = entry.name.removeprefix("package/")
            assert ".." not in Path(name).parts and name not in result, "unsafe npm path"
            result[name] = archive.extractfile(entry).read()
        return result


def assemble(inputs, output, tag):
    version = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["version"]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    assert tag == f"v{version}", "release tag/version mismatch"
    assert not output.exists(), "fresh release destination required"
    binaries, packages = [], []
    copies = []
    for target, os_name, suffix, filename in (
        ("linux", "Linux", "linux-x64", "align-dotenv"),
        ("windows", "Windows", "windows-x64.exe", "align-dotenv.exe"),
    ):
        directory = inputs / target
        metadata = json.loads((directory / "executable/metadata.json").read_text())
        name = f"align-dotenv-v{version}-{suffix}"
        assert metadata["filename"] == name and metadata["os"] == os_name, "binary name/OS mismatch"
        assert metadata["version"] == version and metadata["commit"] == commit, "stale artifact identity"
        assert metadata["architecture"] == "x64", "unsupported architecture"
        binary_path = directory / "executable" / name
        data = binary_path.read_bytes()
        assert len(data) == metadata["bytes"] and hashlib.sha256(data).hexdigest() == metadata["sha256"], "binary integrity mismatch"
        if target == "linux":
            assert data[:5] == b"\x7fELF\x02" and struct.unpack_from("<H", data, 18)[0] == 62, "ELF architecture mismatch"
        else:
            offset = struct.unpack_from("<I", data, 60)[0]
            assert data[:2] == b"MZ" and data[offset:offset + 4] == b"PE\0\0" and struct.unpack_from("<H", data, offset + 4)[0] == 0x8664, "PE architecture mismatch"
        for notice in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
            assert (directory / "executable" / notice).read_bytes() == (ROOT / notice).read_bytes(), "native notice mismatch"
        binaries.append(metadata)
        copies.append((binary_path, name, True))
        platform = "linux-x64" if target == "linux" else "win32-x64"
        package_names = [f"align-dotenv-{platform}-{version}.tgz"]
        if target == "linux":
            package_names.append(f"align-dotenv-{version}.tgz")
        for package_name in package_names:
            path = directory / "npm/tarballs" / package_name
            contents = members(path)
            is_main = package_name == f"align-dotenv-{version}.tgz"
            expected = {"package.json", "LICENSE", "bin/align-dotenv.js"} if is_main else {"package.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "metadata.json", f"bin/{filename}"}
            assert set(contents) == expected, "tarball allowlist mismatch"
            manifest = json.loads(contents["package.json"])
            assert manifest["version"] == version and not manifest.get("scripts"), "package version/scripts mismatch"
            assert contents["LICENSE"] == (ROOT / "LICENSE").read_bytes(), "license mismatch"
            if is_main:
                assert manifest["name"] == "align-dotenv", "main identity mismatch"
                assert manifest["optionalDependencies"] == {"@align-dotenv/linux-x64": version, "@align-dotenv/win32-x64": version}, "optional versions not exact"
                assert manifest["alignDotenvBuild"] == {"version": version, "sourceCommit": commit}, "main provenance mismatch"
            else:
                assert manifest["name"] == f"@align-dotenv/{platform}", "platform identity mismatch"
                assert manifest["os"] == ["linux" if target == "linux" else "win32"] and manifest["cpu"] == ["x64"], "platform selectors mismatch"
                assert contents[f"bin/{filename}"] == data, "packed binary mismatch"
                packed = json.loads(contents["metadata.json"])
                for key in ("bytes", "sha256", "version", "commit", "python", "pyinstaller"):
                    assert packed[key] == metadata[key], "packed provenance mismatch"
                assert contents["THIRD_PARTY_NOTICES.md"] == (ROOT / "THIRD_PARTY_NOTICES.md").read_bytes(), "packed notice mismatch"
            payload = path.read_bytes()
            packages.append(dict(name=manifest["name"], version=version, filename=package_name,
                integrity="sha512-" + base64.b64encode(hashlib.sha512(payload).digest()).decode()))
            copies.append((path, "npm/" + package_name, False))
    # All validation precedes destination creation; never mix stale outputs.
    output.mkdir()
    (output / "npm").mkdir()
    for source, name, executable in copies:
        destination = output / name
        shutil.copyfile(source, destination)
        destination.chmod(0o755 if executable else 0o644)
    for notice in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
        shutil.copyfile(ROOT / notice, output / notice)
    manifest = dict(version=version, sourceCommit=commit, tag=tag, binaries=binaries,
        npm=sorted(packages, key=lambda item: (item["name"] == "align-dotenv", item["name"])),
        releasePolicy=json.loads((ROOT / "release-policy.json").read_text()))
    (output / "BUILD_METADATA.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    checksums = []
    for path in sorted(output.iterdir()):
        if path.is_file():
            checksums.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n")
    (output / "SHA256SUMS").write_text("".join(checksums), encoding="utf-8")
    print(f"Candidate assembled: {tag}, source {commit}; no publication performed")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path, help="directory containing linux/ and windows/ native CI artifacts")
    parser.add_argument("output", type=Path, help="fresh candidate output directory")
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    assemble(args.inputs, args.output, args.tag)
