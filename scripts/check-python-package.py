#!/usr/bin/env python3
"""Inspect built Python artifacts and install the exact wheel in a clean consumer."""
import email
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import venv
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
directory = Path(sys.argv[1]).resolve()
version = tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"]
wheels, sources = list(directory.glob("*.whl")), list(directory.glob("*.tar.gz"))
assert len(wheels) == len(sources) == 1, "require exactly one wheel and sdist"
assert len(list(directory.iterdir())) == 2, "unexpected Python distribution artifacts"
modules = {f"align_dotenv/{path.name}" for path in (root / "src/align_dotenv").glob("*.py")}
with zipfile.ZipFile(wheels[0]) as wheel:
    names = set(wheel.namelist())
    assert {name for name in names if not ".dist-info/" in name} == modules, "wheel module allowlist mismatch"
    for name in names:
        assert not name.startswith("/") and ".." not in Path(name).parts, "unsafe wheel path"
        assert name.endswith((".py", "/METADATA", "/WHEEL", "/RECORD", "/entry_points.txt", "/top_level.txt", "/LICENSE")), "unexpected wheel file"
    metadata_name = next(name for name in names if name.endswith("/METADATA"))
    metadata = email.message_from_bytes(wheel.read(metadata_name))
    assert metadata["Name"] == "align-dotenv" and metadata["Version"] == version, "wheel metadata version mismatch"
    assert not metadata.get_all("Requires-Dist"), "unexpected runtime dependencies"
    for name in modules:
        assert wheel.read(name) == (root / "src" / name).read_bytes(), "wheel source mismatch"
with tarfile.open(sources[0]) as source:
    entries = source.getmembers()
    actual_files = {str(Path(*Path(entry.name).parts[1:])) for entry in entries if entry.isfile()}
    expected_files = {"LICENSE", "MANIFEST.in", "README.md", "pyproject.toml", "setup.cfg", "PKG-INFO"}
    expected_files.update("src/" + name for name in modules)
    expected_files.update("src/align_dotenv.egg-info/" + name for name in ("PKG-INFO", "SOURCES.txt", "dependency_links.txt", "entry_points.txt", "top_level.txt"))
    assert actual_files == expected_files, "sdist file allowlist mismatch"
    for entry in entries:
        assert entry.isfile() or entry.isdir(), "sdist contains nonregular member"
        assert not entry.name.startswith("/") and ".." not in Path(entry.name).parts, "unsafe sdist path"
        relative = Path(*Path(entry.name).parts[1:])
        assert not any(part in {"node_modules", ".git", ".venv", "__pycache__", "uv.lock"} or part.startswith(".env") for part in relative.parts), "sdist forbidden content"
        assert not relative.name.endswith((".exe", ".tgz", ".pyc")), "sdist contains generated artifacts"
    package_info = next(entry for entry in entries if len(Path(entry.name).parts) == 2 and entry.name.endswith("/PKG-INFO"))
    metadata = email.message_from_bytes(source.extractfile(package_info).read())
    assert metadata["Name"] == "align-dotenv" and metadata["Version"] == version, "sdist metadata mismatch"
    for name in modules:
        member = next(entry for entry in entries if entry.name.endswith("/src/" + name))
        assert source.extractfile(member).read() == (root / "src" / name).read_bytes(), "sdist source mismatch"
with tempfile.TemporaryDirectory(prefix="align-python-consumer-") as temp:
    consumer = Path(temp)
    environment = consumer / "venv"
    venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    cli = environment / ("Scripts/align-dotenv.exe" if sys.platform == "win32" else "bin/align-dotenv")
    subprocess.run([str(python), "-m", "pip", "install", "--no-index", "--no-deps", str(wheels[0])], cwd=consumer, check=True)
    subprocess.run([str(cli), "--help"], cwd=consumer, check=True)
    (consumer / ".env").write_bytes(b"KEY=fake-local\n")
    (consumer / ".env.example").write_bytes(b"# Heading\nKEY=default\n")
    assert subprocess.run([str(cli), "--check"], cwd=consumer, capture_output=True).returncode == 1, "installed check exit mismatch"
    subprocess.run([str(cli)], cwd=consumer, check=True)
    assert (consumer / ".env").read_bytes() == b"# Heading\nKEY=fake-local\n", "installed bytes mismatch"
    assert subprocess.run([str(cli), "--check"], cwd=consumer, capture_output=True).returncode == 0, "installed aligned exit mismatch"
    assert subprocess.run([str(cli), "--unexpected"], cwd=consumer, capture_output=True).returncode == 2, "installed error exit mismatch"
print(f"Python {version}: wheel/sdist inspection, clean offline wheel installation and CLI exits 0/1/2 passed")
