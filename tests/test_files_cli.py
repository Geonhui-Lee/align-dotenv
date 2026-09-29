import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from align_dotenv.files import align_file


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

    def test_cli_output_never_includes_values(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / ".env"
            template = Path(directory) / ".env.example"
            target.write_text("KEY=private-secret\n", encoding="utf-8")
            template.write_text("# Heading\nKEY=default\n", encoding="utf-8")
            environment = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1] / "src"))
            command = [sys.executable, "-m", "align_dotenv", str(target), "--template", str(template)]
            first = subprocess.run(command, env=environment, capture_output=True, text=True, check=True)
            second = subprocess.run(command, env=environment, capture_output=True, text=True, check=True)
            self.assertIn("Updated target.", first.stdout)
            self.assertIn("Target already aligned.", second.stdout)
            self.assertNotIn("private-secret", first.stdout + first.stderr + second.stdout + second.stderr)
            self.assertEqual(target.read_text(encoding="utf-8"), "# Heading\nKEY=private-secret\n")


if __name__ == "__main__":
    unittest.main()
