import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from align_dotenv.files import FileValidationError, align_file


def run_cli(target, template, *options):
    environment = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1] / "src"))
    command = [sys.executable, "-m", "align_dotenv", str(target), "--template", str(template),
               *options]
    return subprocess.run(command, env=environment, capture_output=True, text=True)


class FileTests(unittest.TestCase):
    def test_writes_preserve_mode_and_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / ".env.example"
            template.write_bytes(b"KEY=default\r\n")
            target.write_bytes(b"KEY=private\n")
            target.chmod(0o600)
            self.assertTrue(align_file(target, template))
            self.assertEqual(target.read_bytes(), b"KEY=private\r\n")
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            self.assertEqual(set(Path(directory).iterdir()), {target, template})
            inode = target.stat().st_ino
            self.assertFalse(align_file(target, template))
            self.assertEqual(target.stat().st_ino, inode)

    def test_failed_replace_leaves_original_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / ".env.example"
            target.write_text("KEY=private\n", encoding="utf-8")
            template.write_text("# Heading\nKEY=default\n", encoding="utf-8")
            with patch("align_dotenv.files.os.replace", side_effect=OSError("replace failed")):
                with self.assertRaises(OSError):
                    align_file(target, template)
            self.assertEqual(target.read_text(encoding="utf-8"), "KEY=private\n")
            self.assertEqual(set(Path(directory).iterdir()), {target, template})

    def test_failure_before_replace_leaves_original_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / "template"
            target.write_bytes(b"KEY=private\n")
            template.write_bytes(b"# New\nKEY=default\n")
            with patch("align_dotenv.files.os.chmod", side_effect=OSError("chmod failed")):
                with patch("align_dotenv.files.os.replace") as replace:
                    with self.assertRaises(OSError):
                        align_file(target, template)
                    replace.assert_not_called()
            self.assertEqual(target.read_bytes(), b"KEY=private\n")
            self.assertEqual(set(Path(directory).iterdir()), {target, template})

    def test_cli_output_never_includes_values(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / ".env.example"
            target.write_text("KEY=private-secret\n", encoding="utf-8")
            template.write_text("# Heading\nKEY=default\n", encoding="utf-8")
            first = run_cli(target, template)
            second = run_cli(target, template)
            self.assertEqual((first.returncode, second.returncode), (0, 0))
            self.assertIn("Updated target.", first.stdout)
            self.assertIn("Target already aligned.", second.stdout)
            self.assertNotIn("private-secret", first.stdout + first.stderr + second.stdout + second.stderr)
            self.assertEqual(target.read_text(encoding="utf-8"), "# Heading\nKEY=private-secret\n")

    def test_unknown_policies_and_check_are_non_leaking(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / ".env.example"
            original = b"KNOWN=private-secret\nZ=unknown-secret\n# A=other-secret\n"
            target.write_bytes(original)
            target.chmod(0o600)
            template.write_bytes(b"# Header\nKNOWN=default\n")
            inode = target.stat().st_ino
            for options, code in ((("--check",), 1),
                                  (("--unknown", "error"), 2),
                                  (("--unknown", "error", "--check"), 2)):
                with self.subTest(options=options):
                    response = run_cli(target, template, *options)
                    self.assertEqual(response.returncode, code)
                    self.assertEqual(target.read_bytes(), original)
                    self.assertEqual(target.stat().st_ino, inode)
                    self.assertNotIn("secret", response.stdout + response.stderr)
                    self.assertNotIn("Traceback", response.stderr)
                    if "error" in options:
                        self.assertIn("A, Z", response.stderr)
            keep = run_cli(target, template)
            self.assertEqual(keep.returncode, 0)
            self.assertIn(b"Z=unknown-secret", target.read_bytes())
            self.assertIn(b"# A=other-secret", target.read_bytes())
            aligned = target.read_bytes()
            aligned_inode = target.stat().st_ino
            clean_check = run_cli(target, template, "--check")
            self.assertEqual(clean_check.returncode, 0)
            self.assertEqual(target.read_bytes(), aligned)
            self.assertEqual(target.stat().st_ino, aligned_inode)
            removed = run_cli(target, template, "--unknown", "remove")
            self.assertEqual(removed.returncode, 0)
            self.assertEqual(target.read_bytes(), b"# Header\nKNOWN=private-secret\n")
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            self.assertNotIn("secret", keep.stdout + removed.stdout + clean_check.stdout)

    def test_invalid_paths_are_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / ".env"
            template = root / "template"
            target.write_text("KEY=secret\n", encoding="utf-8")
            template.write_text("KEY=default\n", encoding="utf-8")
            alias = root / "alias"
            os.link(target, alias)
            link = root / "link"
            link.symlink_to(target)
            missing = root / "missing"
            for bad_target, bad_template in ((missing, template), (target, missing),
                                             (root, template), (target, root),
                                             (target, target), (alias, target),
                                             (link, template)):
                with self.subTest(target=bad_target, template=bad_template):
                    result = run_cli(bad_target, bad_template)
                    self.assertEqual(result.returncode, 2)
                    self.assertFalse(result.stdout)
                    self.assertTrue(result.stderr.startswith("align-dotenv:"))
                    self.assertNotIn("secret", result.stderr)
                    self.assertEqual(target.read_text(encoding="utf-8"), "KEY=secret\n")

    def test_read_and_write_errors_have_safe_cli_messages(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            template = Path(directory) / "template"
            target.write_text("KEY=secret\n", encoding="utf-8")
            template.write_text("# Header\nKEY=default\n", encoding="utf-8")
            for failing_function in ("_read", "_write_atomically"):
                with self.subTest(function=failing_function):
                    with patch(f"align_dotenv.files.{failing_function}",
                               side_effect=PermissionError("secret from exception")):
                        # The subprocess cannot see mocks; exercise the same CLI entry point in-process.
                        from align_dotenv.cli import main
                        from contextlib import redirect_stderr, redirect_stdout
                        from io import StringIO
                        stdout, stderr = StringIO(), StringIO()
                        with redirect_stdout(stdout), redirect_stderr(stderr):
                            with self.assertRaises(SystemExit) as caught:
                                main([str(target), "--template", str(template)])
                        self.assertEqual(caught.exception.code, 2)
                        self.assertEqual(stdout.getvalue(), "")
                        self.assertNotIn("secret", stderr.getvalue())
            self.assertEqual(target.read_text(encoding="utf-8"), "KEY=secret\n")

    def test_invalid_utf8_and_invocation(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            template = Path(directory) / "template"
            template.write_text("KEY=default\n", encoding="utf-8")
            target.write_bytes(b"KEY=\xff\n")
            result = run_cli(target, template)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertNotIn("\\xff", result.stderr)
            invalid = run_cli(target, template, "--unknown", "invalid")
            self.assertEqual(invalid.returncode, 2)
            self.assertNotIn("Traceback", invalid.stderr)
            environment = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1] / "src"))
            missing_template_option = subprocess.run(
                [sys.executable, "-m", "align_dotenv", str(target)],
                env=environment, capture_output=True, text=True,
            )
            self.assertEqual(missing_template_option.returncode, 2)
            self.assertIn("--template", missing_template_option.stderr)
            self.assertNotIn("Traceback", missing_template_option.stderr)

    def test_validation_does_not_modify_same_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "target"
            path.write_text("KEY=secret\n", encoding="utf-8")
            with self.assertRaises(FileValidationError):
                align_file(path, path)
            self.assertEqual(path.read_text(encoding="utf-8"), "KEY=secret\n")

    def test_unsupported_local_syntax_never_writes_or_leaks_values(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / "template"
            template.write_bytes(b"KNOWN=default\n")
            samples = (
                (b"KNOWN=private-secret\nsource .env.shared\nEXTRA=unknown-secret\n", "2"),
                (b"KNOWN=private-secret\n. .env.shared\n", "2"),
                (b'CERT="private-secret\nmore-secret\n"\nKNOWN=private-secret\n', "1, 2, 3"),
                (b"CERT='private-secret\nmore-secret'\nKNOWN=private-secret\n", "1, 2"),
            )
            for original, lines in samples:
                for policy in ("keep", "remove", "error"):
                    for check in (False, True):
                        with self.subTest(lines=lines, policy=policy, check=check):
                            target.write_bytes(original)
                            target.chmod(0o600)
                            inode = target.stat().st_ino
                            options = ("--unknown", policy) + (("--check",) if check else ())
                            result = run_cli(target, template, *options)
                            self.assertEqual(result.returncode, 2)
                            self.assertEqual(result.stdout, "")
                            self.assertIn("unsupported local syntax", result.stderr)
                            self.assertIn(lines, result.stderr)
                            self.assertNotIn("secret", result.stderr)
                            self.assertNotIn(".env.shared", result.stderr)
                            self.assertEqual(target.read_bytes(), original)
                            self.assertEqual(target.stat().st_ino, inode)
                            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)


if __name__ == "__main__":
    unittest.main()
