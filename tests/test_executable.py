"""Actual artifact gates, reusing the released fixture/CLI contract.

ALIGN_DOTENV_EXE must be an absolute artifact path. Without it these tests skip;
CI uses discovery with this variable set, so an invalid artifact fails, not skips.
All artifact invocations use an external cwd and a PATH containing no Python.
"""

import ctypes
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_files_cli as files_contract
import test_fixtures as fixture_contract
import test_project as project_contract


EXE = os.environ.get("ALIGN_DOTENV_EXE")
ROOT = Path(__file__).resolve().parents[1]
TEMP_ROOT = "/tmp/opencode" if Path("/tmp/opencode").is_dir() else None


def run_exe(*args, cwd=None):
    # No repository/installed package imports or Python launcher via PATH.
    with tempfile.TemporaryDirectory(dir=TEMP_ROOT, prefix="align executable ") as directory:
        environment = {key: value for key, value in os.environ.items()
                       if not key.upper().startswith("PYTHON")}
        environment["PATH"] = directory
        environment["PYTHONPATH"] = str(Path(directory) / "nonexistent")
        environment["PYTHONHOME"] = str(Path(directory) / "nonexistent")
        return subprocess.run([EXE, *map(str, args)], cwd=cwd or directory,
                              env=environment, capture_output=True, timeout=30)


def fixture_cli(target, template, policy, check=False):
    options = ("--unknown", policy) + (("--check",) if check else ())
    return run_exe(target, "--template", template, *options)


def file_cli(target, template, *options):
    response = run_exe(target, "--template", template, *options)
    # The focused CLI suite uses text=True (universal newlines).
    response.stdout = response.stdout.decode("utf-8").replace("\r\n", "\n")
    response.stderr = response.stderr.decode("utf-8").replace("\r\n", "\n")
    return response


def project_cli(root, *options):
    response = run_exe(*options, cwd=root)
    response.stdout = response.stdout.decode("utf-8").replace("\r\n", "\n")
    response.stderr = response.stderr.decode("utf-8").replace("\r\n", "\n")
    return response


@unittest.skipUnless(EXE, "ALIGN_DOTENV_EXE not set")
class ExecutableFixtureTests(unittest.TestCase):
    # Exactly the shared fixture contract, including second passes, all policies,
    # malformed UTF-8, native stdout newlines and payload-free assertions.
    assert_safe_response = fixture_contract.SharedFixtureTests.assert_safe_response
    test_successful_files_and_cli = fixture_contract.SharedFixtureTests.test_successful_files_and_cli
    test_invalid_files_never_write_or_leak = fixture_contract.SharedFixtureTests.test_invalid_files_never_write_or_leak

    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(fixture_contract, "run_cli", fixture_cli).start()


@unittest.skipUnless(EXE, "ALIGN_DOTENV_EXE not set")
class ExecutableProjectTests(project_contract.ProjectTests):
    """Reuse every project scenario, changing only the subprocess boundary."""

    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(project_contract, "run_project", project_cli).start()

    def test_discovery_maps_suffixes_recursively_in_sorted_order(self):
        # Baseline discovery tests call Python APIs directly. The artifact must
        # instead prove discovery through its public CLI and exact target bytes.
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as directory:
            root = Path(directory)
            targets = []
            for name in ("z/.env.production", "a/.env.development", ".env",
                         "frontend/.env.local", "backend/.env.runtime"):
                targets.append(project_contract.pair(root, name,
                    ".template" if name.endswith("production") else ".example"))
            (root / "config.example").write_bytes(b"ignored")
            (root / "settings.template").write_bytes(b"ignored")
            result = run_exe(cwd=root)
            self.assertEqual(result.returncode, 0)
            self.assertTrue(result.stdout == ("Aligned 5 dotenv files." + os.linesep).encode(),
                            "discovery summary mismatch (payload redacted)")
            for target in targets:
                self.assertTrue(target.read_bytes() == b"# Heading\nKEY=private-secret\n",
                                "discovered target mismatch (payload redacted)")

    def test_excluded_directories_and_directory_symlinks(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as directory:
            root = Path(directory)
            target = project_contract.pair(root, ".env")
            for name in (".git", "node_modules", ".venv", "venv", "__pycache__"):
                for location in (name, "nested/" + name):
                    project_contract.pair(root, location + "/.env", local=b"source fake-secret\n")
            with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as outside:
                project_contract.pair(Path(outside), ".env", local=b"source fake-secret\n")
                (root / "link").symlink_to(outside, target_is_directory=True)
                result = run_exe(cwd=root)
                self.assertEqual(result.returncode, 0)
                self.assertTrue(result.stdout == ("Aligned 1 dotenv file." + os.linesep).encode(),
                                "excluded-directory summary mismatch (payload redacted)")
                self.assertTrue(target.read_bytes() == b"# Heading\nKEY=private-secret\n",
                                "target mismatch (payload redacted)")


@unittest.skipUnless(EXE, "ALIGN_DOTENV_EXE not set")
class ExecutableFileTests(unittest.TestCase):
    test_cli_output_never_includes_values = files_contract.FileTests.test_cli_output_never_includes_values
    test_unknown_policies_and_check_are_non_leaking = files_contract.FileTests.test_unknown_policies_and_check_are_non_leaking
    test_invalid_paths_are_rejected_without_writing = files_contract.FileTests.test_invalid_paths_are_rejected_without_writing
    test_unsupported_local_syntax_never_writes_or_leaks_values = files_contract.FileTests.test_unsupported_local_syntax_never_writes_or_leaks_values

    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(files_contract, "run_cli", file_cli).start()


@unittest.skipUnless(EXE, "ALIGN_DOTENV_EXE not set")
class ExecutableBoundaryTests(unittest.TestCase):
    def assert_bytes(self, actual, expected):
        self.assertTrue(actual == expected, "bytes mismatch (payload redacted)")

    def test_help_and_artifact_independence(self):
        self.assertTrue(Path(EXE).is_absolute(), "artifact path must be absolute")
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT, prefix="isolated artifact ") as directory:
            root = Path(directory)
            artifact = root / ("align-dotenv.exe" if os.name == "nt" else "align-dotenv")
            shutil.copy2(EXE, artifact)
            # Poison both possible checkout-style import locations. A fallback
            # to cwd/PYTHONPATH would crash rather than silently pass.
            (root / "align_dotenv.py").write_text("raise RuntimeError('external import')\n")
            (root / "align_dotenv").mkdir()
            (root / "align_dotenv/__init__.py").write_text("raise RuntimeError('external import')\n")
            (root / ".env.example").write_bytes(b"# Heading\nKEY=default\n")
            (root / ".env").write_bytes(b"KEY=fake-secret\n")
            with patch(__name__ + ".EXE", str(artifact)):
                help_result = run_exe("--help", cwd=root)
                self.assertEqual(help_result.returncode, 0)
                self.assertTrue(b"--check" in help_result.stdout)
                self.assert_bytes(help_result.stderr, b"")
                result = run_exe(cwd=root)
                self.assertEqual(result.returncode, 0)
                self.assert_bytes((root / ".env").read_bytes(), b"# Heading\nKEY=fake-secret\n")

    def test_python_cli_differential_project_fixtures(self):
        # The fixture output is still the independent oracle; this adds direct
        # binary/Python parity for project summaries, late preflight and bytes.
        for group in ("reconciliation", "invalid"):
            for case in fixture_contract.load_cases(group):
                policies = case.get("policies", [case.get("unknown")])
                for policy in policies:
                    for check in (False, True):
                        with self.subTest(case=case["id"], policy=policy, check=check), \
                             tempfile.TemporaryDirectory(dir=TEMP_ROOT) as directory:
                            roots = [Path(directory) / name for name in ("python", "binary")]
                            for root in roots:
                                for folder in ("a", "z"):
                                    (root / folder).mkdir(parents=True)
                                (root / "a/.env.example").write_bytes(b"# Heading\nFIRST=default\n")
                                (root / "a/.env").write_bytes(b"FIRST=fake-secret\n")
                                (root / "z/.env.example").write_bytes(fixture_contract.input_bytes(case, "template"))
                                (root / "z/.env").write_bytes(fixture_contract.input_bytes(case, "local"))
                            options = ["--unknown", policy] + (["--check"] if check else [])
                            source = subprocess.run([sys.executable, "-m", "align_dotenv", *options],
                                cwd=roots[0], env=dict(os.environ, PYTHONPATH=str(ROOT / "src")),
                                capture_output=True, timeout=30)
                            binary = run_exe(*options, cwd=roots[1])
                            self.assertEqual(binary.returncode, source.returncode)
                            self.assert_bytes(binary.stdout, source.stdout)
                            self.assert_bytes(binary.stderr, source.stderr)
                            for path in ("a/.env", "z/.env"):
                                self.assert_bytes((roots[0] / path).read_bytes(), (roots[1] / path).read_bytes())
                            if group == "invalid" or check:
                                self.assert_bytes((roots[1] / "a/.env").read_bytes(), b"FIRST=fake-secret\n")
                            self.assertEqual(len(list(roots[1].rglob("*"))), 6)

    def test_invalid_invocations(self):
        for options in ((".env",), ("--template", ".env.example"),
                        ("--unknown", "invalid"), ("--not-an-option",)):
            with self.subTest(options=options):
                result = run_exe(*options)
                self.assertEqual(result.returncode, 2)
                self.assert_bytes(result.stdout, b"")
                self.assertFalse(b"Traceback" in result.stderr)

    def test_explicit_paths_with_spaces_and_noop_identity(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT, prefix="explicit space ") as directory:
            root = Path(directory)
            target, template = root / "local dotenv", root / "template dotenv"
            target.write_bytes(b"KEY=fake-secret\n")
            template.write_bytes(b"# Heading\r\nKEY=default\r\n")
            result = run_exe(target, "--template", template)
            self.assertEqual(result.returncode, 0)
            self.assert_bytes(target.read_bytes(), b"# Heading\r\nKEY=fake-secret\r\n")
            before = fixture_contract.identity(target)
            for options in ((), ("--check",)):
                result = run_exe(target, "--template", template, *options)
                self.assertEqual(result.returncode, 0)
                self.assertEqual(fixture_contract.identity(target), before)
            self.assertEqual(set(root.iterdir()), {target, template})

    def test_failed_replacement_preserves_original_and_cleans_temporary(self):
        with tempfile.TemporaryDirectory(dir=TEMP_ROOT) as directory:
            root = Path(directory)
            target, template = root / ".env", root / ".env.example"
            original = b"KEY=fake-secret\n"
            target.write_bytes(original)
            template.write_bytes(b"# Heading\nKEY=default\n")
            if os.name == "nt":
                # Allow reads, deny delete-sharing: Windows replacement must fail
                # after the same-directory temporary has been written/closed.
                from ctypes import wintypes
                kernel = ctypes.WinDLL("kernel32", use_last_error=True)
                kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD,
                    wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
                kernel.CreateFileW.restype = wintypes.HANDLE
                kernel.CloseHandle.argtypes = [wintypes.HANDLE]
                handle = kernel.CreateFileW(str(target), 0x80000000, 1, None, 3, 0, None)
                self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
                try:
                    result = run_exe(target, "--template", template)
                finally:
                    kernel.CloseHandle(handle)
            else:
                if os.geteuid() == 0:
                    self.skipTest("root bypasses POSIX directory write restrictions")
                root.chmod(0o500)
                try:
                    result = run_exe(target, "--template", template)
                finally:
                    root.chmod(0o700)
            self.assertEqual(result.returncode, 2)
            self.assert_bytes(result.stdout, b"")
            self.assert_bytes(result.stderr, ("align-dotenv: cannot read or update files; "
                              "check paths and permissions." + os.linesep).encode())
            self.assert_bytes(target.read_bytes(), original)
            self.assertEqual(set(root.iterdir()), {target, template})


if __name__ == "__main__":
    unittest.main()
