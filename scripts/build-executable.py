#!/usr/bin/env python3
"""Build a standalone align-dotenv executable using PyInstaller.

Usage:
    python scripts/build-executable.py [--output-dir DIR]

The script reads the version from pyproject.toml, builds a single-file
executable using PyInstaller, and places it in the output directory with a
version-tagged name:

    align-dotenv-v{VERSION}-linux-x64        (Linux)
    align-dotenv-v{VERSION}-windows-x64.exe  (Windows)

The executable embeds the Python interpreter; end users do not need Python
installed. The built artifact must not be committed to Git.

Environment requirements:
    - Python 3.11+ (the build Python; sets the bundled interpreter version)
    - Pinned dependencies from scripts/requirements-executable.txt

No other runtime dependencies. The package itself has none.
"""

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path


def read_version(root: Path) -> str:
    """Read version from pyproject.toml without importing the package."""
    with (root / "pyproject.toml").open("rb") as stream:
        return tomllib.load(stream)["project"]["version"]


def platform_suffix() -> str:
    """Return the platform suffix for the artifact name."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    # Normalize architecture names to match release artifact convention.
    arch_map = {
        "x86_64": "x64",
        "amd64": "x64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }
    arch = arch_map.get(machine, machine)
    if system == "windows":
        return f"windows-{arch}"
    elif system == "linux":
        return f"linux-{arch}"
    else:
        raise ValueError("Phase 1 builds require Linux or Windows")


def artifact_name(version: str) -> str:
    """Return the versioned artifact filename (with .exe on Windows)."""
    suffix = platform_suffix()
    name = f"align-dotenv-v{version}-{suffix}"
    if platform.system() == "Windows":
        name += ".exe"
    return name


def build(root: Path, output_dir: Path) -> Path:
    """Build the executable; return the final artifact path."""
    version = read_version(root)
    name = artifact_name(version)

    print(f"Building align-dotenv v{version} for {platform_suffix()}...")
    print(f"  Output: {output_dir / name}")

    output_dir.mkdir(parents=True, exist_ok=True)

    # Create a temporary launcher that avoids the relative-import issue in
    # __main__.py (which assumes it is run as part of a package, not directly
    # by PyInstaller).  The generated script uses absolute imports only.
    with tempfile.TemporaryDirectory(prefix="align-dotenv-build-") as tmpdir:
        entry = Path(tmpdir) / "_align_dotenv_entry.py"
        entry.write_text(
            "from align_dotenv.cli import main\n"
            "import sys\n"
            "sys.exit(main())\n",
            encoding="utf-8",
        )

        dist_dir = Path(tmpdir) / "dist"
        work_dir = Path(tmpdir) / "work"
        spec_dir = Path(tmpdir) / "spec"

        cmd = [
            sys.executable, "-m", "PyInstaller",
            "--onefile",
            "--noupx",
            "--noconfirm",
            "--name", "align-dotenv",
            "--distpath", str(dist_dir),
            "--workpath", str(work_dir),
            "--specpath", str(spec_dir),
            # Ensure the package source is on sys.path during analysis.
            "--paths", str(root / "src"),
            str(entry),
        ]

        print(f"  Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=root)
        if result.returncode != 0:
            print(f"PyInstaller failed with exit code {result.returncode}",
                  file=sys.stderr)
            sys.exit(1)

        # Locate the built binary (name without .exe on POSIX, with on Windows).
        built = dist_dir / "align-dotenv"
        if platform.system() == "Windows":
            built = built.with_suffix(".exe")
        if not built.exists():
            print(f"Expected binary not found: {built}", file=sys.stderr)
            sys.exit(1)

        dest = output_dir / name
        shutil.copy2(str(built), str(dest))
        if platform.system() != "Windows":
            dest.chmod(dest.stat().st_mode | 0o111)  # ensure executable bit

    print(f"  Built: {dest} ({dest.stat().st_size // 1024} KiB)")
    import PyInstaller

    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()
    metadata = dict(
        filename=dest.name, bytes=dest.stat().st_size,
        sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),
        os=platform.system(), architecture=platform_suffix().split("-")[-1],
        version=version, commit=commit, python=platform.python_version(),
        pyinstaller=PyInstaller.__version__, libc=platform.libc_ver(),
    )
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a standalone align-dotenv executable with PyInstaller."
    )
    parser.add_argument(
        "--output-dir", default="dist/executable",
        help="directory to place the final artifact (default: dist/executable)"
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = root / output_dir

    # Verify PyInstaller is importable before doing anything else.
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print(
            "PyInstaller is not installed. Run:\n"
            "  python -m pip install -r scripts/requirements-executable.txt\n"
            "or use the build environment that has it available.",
            file=sys.stderr,
        )
        sys.exit(1)

    build(root, output_dir)


if __name__ == "__main__":
    main()
