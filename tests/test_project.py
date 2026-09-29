import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

from align_dotenv.project import discover, plan_project


def run_project(root, *options):
    environment = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1] / "src"))
    return subprocess.run([sys.executable, "-m", "align_dotenv", *options], cwd=root,
                          env=environment, capture_output=True, text=True)


def pair(root, name, template=".example", local=b"KEY=private-secret\n",
         sample=b"# Heading\nKEY=default\n"):
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(local)
    target.with_name(target.name + template).write_bytes(sample)
    return target


class ProjectTests(unittest.TestCase):
    def test_discovery_maps_suffixes_recursively_in_sorted_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("z/.env.production", "a/.env.development", ".env",
                         "frontend/.env.local", "backend/.env.runtime"):
                pair(root, name, ".template" if name.endswith("production") else ".example")
            (root / "config.example").write_text("ignored")
            (root / "settings.template").write_text("ignored")
            self.assertEqual([p.target.relative_to(root).as_posix() for p in discover(root)],
                             [".env", "a/.env.development", "backend/.env.runtime",
                              "frontend/.env.local", "z/.env.production"])
            self.assertEqual(len(plan_project(root).pairs), 5)

    def test_excluded_directories_and_directory_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pair(root, ".env")
            for name in (".git", "node_modules", ".venv", "venv", "__pycache__"):
                pair(root, f"{name}/.env")
                pair(root, f"nested/{name}/.env")
            (root / "link").symlink_to(root / "nested", target_is_directory=True)
            self.assertEqual([p.target.relative_to(root).as_posix() for p in discover(root)],
                             [".env"])

    def test_missing_target_is_skipped_and_never_created(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            valid = pair(root, ".env")
            (root / "nested").mkdir()
            (root / "nested/.env.template").write_text("KEY=default\n")
            response = run_project(root)
            self.assertEqual(response.returncode, 0, response.stderr)
            self.assertIn("Aligned 1", response.stdout)
            self.assertIn("Skipped 1", response.stdout)
            self.assertFalse((root / "nested/.env").exists())
            self.assertEqual(valid.read_bytes(), b"# Heading\nKEY=private-secret\n")

    def test_ambiguity_prevents_all_writes_even_when_target_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, "a/.env")
            pair(root, "z/.env")
            (root / "z/.env.template").write_text("KEY=default\n")
            original = first.read_bytes()
            for options in ((), ("--check",)):
                response = run_project(root, *options)
                self.assertEqual(response.returncode, 2)
                self.assertEqual(response.stdout, "")
                self.assertIn("z/.env.example", response.stderr)
                self.assertIn("z/.env.template", response.stderr)
                self.assertEqual(first.read_bytes(), original)
            (root / "z/.env").unlink()
            self.assertEqual(run_project(root).returncode, 2)
            self.assertEqual(first.read_bytes(), original)

    def test_alignment_preserves_local_values_state_unknowns_modes_and_inodes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, ".env", local=b"# KEY=private-secret\nEXTRA=unknown-secret\n")
            second = pair(root, "nested/.env.local", ".template",
                          local=b"KEY=other-secret\n", sample=b"# KEY=default\n")
            first.chmod(0o600)
            response = run_project(root)
            self.assertEqual(response.returncode, 0, response.stderr)
            self.assertEqual(first.read_bytes(),
                             b"# Heading\n# KEY=private-secret\n\nEXTRA=unknown-secret\n")
            self.assertEqual(second.read_bytes(), b"KEY=other-secret\n")
            self.assertEqual(stat.S_IMODE(first.stat().st_mode), 0o600)
            inodes = first.stat().st_ino, second.stat().st_ino
            self.assertEqual(run_project(root).returncode, 0)
            self.assertEqual((first.stat().st_ino, second.stat().st_ino), inodes)
            self.assertNotIn("secret", response.stdout + response.stderr)

    def test_unsupported_syntax_preflights_every_pair_in_either_order(self):
        for bad_name in ("a/.env", "z/.env"):
            with self.subTest(bad_name=bad_name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                first = pair(root, "a/.env")
                second = pair(root, "z/.env")
                bad = root / bad_name
                bad.write_bytes(b"KEY=private-secret\nsource hidden-secret\n")
                originals = first.read_bytes(), second.read_bytes()
                inodes = first.stat().st_ino, second.stat().st_ino
                for options in ((), ("--check",)):
                    response = run_project(root, *options)
                    self.assertEqual(response.returncode, 2)
                    self.assertIn(bad_name, response.stderr)
                    self.assertNotIn("secret", response.stdout + response.stderr)
                    self.assertEqual((first.read_bytes(), second.read_bytes()), originals)
                    self.assertEqual((first.stat().st_ino, second.stat().st_ino), inodes)

    def test_check_exit_codes_and_no_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, ".env")
            second = pair(root, "nested/.env", local=b"KEY=other-secret\n",
                          sample=b"KEY=default\n")
            original = first.read_bytes(), second.read_bytes()
            inodes = first.stat().st_ino, second.stat().st_ino
            response = run_project(root, "--check")
            self.assertEqual(response.returncode, 1)
            self.assertIn("1 dotenv file needs alignment", response.stdout)
            self.assertEqual((first.read_bytes(), second.read_bytes()), original)
            self.assertEqual((first.stat().st_ino, second.stat().st_ino), inodes)
            self.assertEqual(run_project(root).returncode, 0)
            self.assertEqual(run_project(root, "--check").returncode, 0)
            self.assertNotIn("secret", response.stdout + response.stderr)

    def test_unknown_policies_are_project_wide_and_errors_are_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, "a/.env")
            second = pair(root, "z/.env", local=b"KEY=private-secret\nEXTRA=unknown-secret\n")
            originals = first.read_bytes(), second.read_bytes()
            for options in (("--unknown", "error"), ("--unknown", "error", "--check")):
                response = run_project(root, *options)
                self.assertEqual(response.returncode, 2)
                self.assertIn("EXTRA", response.stderr)
                self.assertNotIn("secret", response.stdout + response.stderr)
                self.assertEqual((first.read_bytes(), second.read_bytes()), originals)
            self.assertEqual(run_project(root, "--unknown", "keep").returncode, 0)
            self.assertIn(b"EXTRA=unknown-secret", second.read_bytes())
            self.assertEqual(run_project(root, "--unknown", "remove").returncode, 0)
            self.assertNotIn(b"EXTRA", second.read_bytes())

    def test_invalid_targets_and_templates_fail_before_writes(self):
        for invalid in ("target-symlink", "target-directory", "template-symlink", "template-directory"):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                valid = pair(root, "a/.env")
                other = pair(root, "z/.env")
                template = root / "z/.env.example"
                if invalid.startswith("target"):
                    other.unlink()
                    if invalid == "target-symlink":
                        other.symlink_to(valid)
                    else:
                        other.mkdir()
                else:
                    template.unlink()
                    if invalid == "template-symlink":
                        template.symlink_to(root / "a/.env.example")
                    else:
                        template.mkdir()
                before = valid.read_bytes()
                response = run_project(root)
                self.assertEqual(response.returncode, 2, response.stdout)
                self.assertEqual(valid.read_bytes(), before)

    def test_invalid_utf8_in_later_pair_prevents_earlier_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, "a/.env")
            second = pair(root, "z/.env", local=b"KEY=\xff\n")
            before = first.read_bytes(), second.read_bytes()
            response = run_project(root)
            self.assertEqual(response.returncode, 2)
            self.assertIn("UTF-8", response.stderr)
            self.assertNotIn("secret", response.stdout + response.stderr)
            self.assertEqual((first.read_bytes(), second.read_bytes()), before)

    def test_empty_project_is_aligned(self):
        with tempfile.TemporaryDirectory() as directory:
            for options in ((), ("--check",)):
                response = run_project(directory, *options)
                self.assertEqual(response.returncode, 0)
                self.assertEqual(response.stdout, "All 0 dotenv files are aligned.\n")

    def test_already_aligned_file_count_grammar(self):
        for count, expected in ((1, "1 dotenv file is aligned.\n"),
                                (2, "All 2 dotenv files are aligned.\n")):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for index in range(count):
                    pair(root, f"app{index}/.env", local=b"# Heading\nKEY=private-secret\n")
                for options in ((), ("--check",)):
                    response = run_project(root, *options)
                    self.assertEqual(response.returncode, 0)
                    self.assertEqual(response.stdout, expected)
                    self.assertNotIn("private-secret", response.stdout + response.stderr)

    def test_discovered_template_cannot_be_another_pairs_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = pair(root, ".env")
            template = root / ".env.example"
            (root / ".env.example.example").write_text("KEY=default\n")
            original = first.read_bytes(), template.read_bytes()
            response = run_project(root)
            self.assertEqual(response.returncode, 2)
            self.assertIn("cannot also be a target", response.stderr)
            self.assertEqual((first.read_bytes(), template.read_bytes()), original)


if __name__ == "__main__":
    unittest.main()
