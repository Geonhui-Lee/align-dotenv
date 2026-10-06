"""Synthetic release-assembly guards; native CI separately proves real binaries."""
import base64
import hashlib
import importlib.util
import io
import json
import struct
import subprocess
import tarfile
import tempfile
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("prepare_release", ROOT / "scripts/prepare-release.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ReleaseAssemblyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="align-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.version = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["version"]
        self.commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        self.inputs, self.output = self.root / "inputs", self.root / "output"
        self.contents = {}
        for target, os_name, platform, suffix, filename in (
            ("linux", "Linux", "linux-x64", "linux-x64", "align-dotenv"),
            ("windows", "Windows", "win32-x64", "windows-x64.exe", "align-dotenv.exe"),
        ):
            directory = self.inputs / target
            (directory / "executable").mkdir(parents=True)
            (directory / "npm/tarballs").mkdir(parents=True)
            data = bytearray(256)
            if target == "linux":
                data[:5] = b"\x7fELF\x02"; struct.pack_into("<H", data, 18, 62)
            else:
                data[:2] = b"MZ"; struct.pack_into("<I", data, 60, 64)
                data[64:68] = b"PE\0\0"; struct.pack_into("<H", data, 68, 0x8664)
            name = f"align-dotenv-v{self.version}-{suffix}"
            metadata = dict(filename=name, os=os_name, architecture="x64", version=self.version,
                commit=self.commit, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), python="3.13.15", pyinstaller="6.20.0")
            (directory / "executable" / name).write_bytes(data)
            (directory / "executable/metadata.json").write_text(json.dumps(metadata))
            for notice in ("LICENSE", "THIRD_PARTY_NOTICES.md"):
                (directory / "executable" / notice).write_bytes((ROOT / notice).read_bytes())
            contents = {"package.json": (ROOT / "node/npm/platforms" / platform / "package.json").read_bytes(),
                "LICENSE": (ROOT / "LICENSE").read_bytes(), "THIRD_PARTY_NOTICES.md": (ROOT / "THIRD_PARTY_NOTICES.md").read_bytes(),
                "metadata.json": json.dumps(metadata).encode(), f"bin/{filename}": bytes(data)}
            self.write_tar(directory / "npm/tarballs" / f"align-dotenv-{platform}-{self.version}.tgz", contents)
            if target == "linux":
                manifest = json.loads((ROOT / "node/npm/package.json").read_text())
                manifest["alignDotenvBuild"] = dict(version=self.version, sourceCommit=self.commit)
                self.main = directory / "npm/tarballs" / f"align-dotenv-{self.version}.tgz"
                self.main_contents = {"package.json": json.dumps(manifest).encode(), "LICENSE": (ROOT / "LICENSE").read_bytes(), "bin/align-dotenv.js": (ROOT / "node/npm/bin/align-dotenv.js").read_bytes()}
                self.write_tar(self.main, self.main_contents)

    def write_tar(self, path, contents):
        with tarfile.open(path, "w:gz") as archive:
            for name, payload in contents.items():
                item = tarfile.TarInfo("package/" + name); item.size = len(payload)
                archive.addfile(item, io.BytesIO(payload))

    def assemble(self):
        return prepare.assemble(self.inputs, self.output, f"v{self.version}")

    def reject_metadata(self, key, value):
        path = self.inputs / "linux/executable/metadata.json"
        data = json.loads(path.read_text()); data[key] = value; path.write_text(json.dumps(data))
        with self.assertRaises(AssertionError):
            self.assemble()
        self.assertFalse(self.output.exists())

    def test_valid_bundle_has_exact_checksums_and_order(self):
        bundle = self.assemble()
        self.assertEqual(bundle["sourceCommit"], self.commit)
        self.assertEqual([item["name"] for item in bundle["npm"]], ["@align-dotenv/linux-x64", "@align-dotenv/win32-x64", "align-dotenv"])
        for line in (self.output / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ")
            self.assertEqual(digest, hashlib.sha256((self.output / name).read_bytes()).hexdigest())
        for item in bundle["npm"]:
            payload = (self.output / "npm" / item["filename"]).read_bytes()
            self.assertEqual(item["integrity"], "sha512-" + base64.b64encode(hashlib.sha512(payload).digest()).decode())

    def test_stale_commit_rejected(self): self.reject_metadata("commit", "0" * 40)
    def test_wrong_version_rejected(self): self.reject_metadata("version", "9.9.9")
    def test_wrong_hash_rejected(self): self.reject_metadata("sha256", "0" * 64)
    def test_wrong_architecture_rejected(self): self.reject_metadata("architecture", "arm64")

    def test_existing_output_preserved(self):
        self.output.mkdir(); sentinel = self.output / "sentinel"; sentinel.write_text("owned")
        with self.assertRaises(AssertionError): self.assemble()
        self.assertEqual(sentinel.read_text(), "owned")

    def test_unsafe_tar_member_rejected(self):
        self.main_contents["../unexpected"] = b"owned"
        self.write_tar(self.main, self.main_contents)
        with self.assertRaises(AssertionError): self.assemble()
        self.assertFalse(self.output.exists())

    def test_optional_version_range_rejected(self):
        manifest = json.loads(self.main_contents["package.json"])
        manifest["optionalDependencies"]["@align-dotenv/linux-x64"] = "^" + self.version
        self.main_contents["package.json"] = json.dumps(manifest).encode()
        self.write_tar(self.main, self.main_contents)
        with self.assertRaises(AssertionError): self.assemble()
        self.assertFalse(self.output.exists())


if __name__ == "__main__": unittest.main()
