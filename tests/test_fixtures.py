"""Runtime-neutral parity cases, with payload-free assertion diagnostics."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from align_dotenv.parser import UnsupportedLocalSyntaxError
from align_dotenv.reconcile import UnknownKeysError, reconcile


ROOT = Path(__file__).resolve().parents[1]


def load_cases(group):
    document = json.loads((ROOT / "fixtures" / group / "cases.json").read_text(encoding="utf-8"))
    if document["schema_version"] != 1:
        raise ValueError("unsupported fixture schema version")
    cases = document["cases"]
    ids = [case["id"] for case in cases]
    if not cases or len(ids) != len(set(ids)):
        raise ValueError("fixture IDs must be unique within a nonempty group")
    for case in cases:
        for name in ("template", "local"):
            if (name in case) == (name + "_hex" in case):
                raise ValueError(f"{case['id']}: input must have exactly one representation")
    return cases


def input_bytes(case, name):
    return (case[name].encode("utf-8") if name in case
            else bytes.fromhex(case[name + "_hex"]))


def run_cli(target, template, policy, check=False):
    environment = dict(os.environ, PYTHONPATH=str(ROOT / "src"))
    command = [sys.executable, "-m", "align_dotenv", str(target), "--template", str(template),
               "--unknown", policy]
    if check:
        command.append("--check")
    return subprocess.run(command, env=environment, capture_output=True)


def identity(path):
    status = path.stat()
    return status.st_dev, status.st_ino, status.st_mode, status.st_mtime_ns


class SharedFixtureTests(unittest.TestCase):
    def assert_safe_response(self, response, code, stdout=b"", stderr=b""):
        self.assertEqual(response.returncode, code)
        # Python standard streams translate logical LF to the platform newline.
        stdout = stdout.replace(b"\n", os.linesep.encode("ascii"))
        stderr = stderr.replace(b"\n", os.linesep.encode("ascii"))
        # Do not let assertion failures echo dotenv values from a broken CLI.
        self.assertTrue(response.stdout == stdout, "stdout contract mismatch (payload redacted)")
        self.assertTrue(response.stderr == stderr, "stderr contract mismatch (payload redacted)")

    def assert_reconcile_error(self, template, local, policy, expected):
        error_type = {"unsupported_local_syntax": UnsupportedLocalSyntaxError,
                      "unknown_keys": UnknownKeysError}[expected["kind"]]
        with self.assertRaises(error_type) as caught:
            reconcile(template, local, policy)
        self.assertTrue(str(caught.exception) == expected["message"],
                        "error contract mismatch (payload redacted)")
        attribute = "lines" if expected["kind"] == "unsupported_local_syntax" else "keys"
        self.assertTrue(getattr(caught.exception, attribute) == tuple(expected[attribute]),
                        "error metadata mismatch (payload redacted)")

    def test_reconciliation_and_second_pass(self):
        for case in load_cases("reconciliation"):
            with self.subTest(case=case["id"]):
                result = reconcile(case["template"], case["local"], case["unknown"])
                self.assertTrue(result.content == case["expected"], "content mismatch (payload redacted)")
                self.assertTrue(result.unknown_keys == tuple(case["unknown_keys"]),
                                "unknown keys mismatch (payload redacted)")
                if "followup_error" in case:
                    self.assert_reconcile_error(case["template"], result.content, case["unknown"],
                                                case["followup_error"])
                else:
                    second = reconcile(case["template"], result.content, case["unknown"])
                    self.assertTrue(second.content == result.content, "not idempotent (payload redacted)")
                    expected_keys = case["unknown_keys"] if case["unknown"] == "keep" else []
                    self.assertTrue(second.unknown_keys == tuple(expected_keys),
                                    "second-pass unknown keys mismatch (payload redacted)")

    def test_invalid_reconciliation(self):
        for case in load_cases("invalid"):
            if case["error"]["kind"] == "invalid_utf8":
                continue  # Strict decoding is tested through the real file/CLI boundary below.
            for policy in case["policies"]:
                with self.subTest(case=case["id"], policy=policy):
                    self.assert_reconcile_error(case["template"], case["local"], policy, case["error"])

    def test_successful_files_and_cli(self):
        for case in load_cases("reconciliation"):
            with self.subTest(case=case["id"]), tempfile.TemporaryDirectory() as directory:
                target, template = Path(directory) / ".env", Path(directory) / "template"
                original = input_bytes(case, "local")
                sample = input_bytes(case, "template")
                expected = case["expected"].encode("utf-8")
                target.write_bytes(original)
                template.write_bytes(sample)
                before = identity(target)
                changed = original != expected
                response = run_cli(target, template, case["unknown"], check=True)
                self.assert_safe_response(response, int(changed),
                                          b"Target is not aligned.\n" if changed else b"Target is aligned.\n")
                self.assertTrue(target.read_bytes() == original, "check modified content (payload redacted)")
                self.assertEqual(identity(target), before)
                response = run_cli(target, template, case["unknown"])
                self.assert_safe_response(response, 0,
                                          b"Updated target.\n" if changed else b"Target already aligned.\n")
                self.assertTrue(target.read_bytes() == expected, "file content mismatch (payload redacted)")
                aligned_identity = identity(target)
                self.assertEqual(aligned_identity[2], before[2])
                if not changed:
                    self.assertEqual(aligned_identity, before)
                for check in (False, True):
                    response = run_cli(target, template, case["unknown"], check=check)
                    if "followup_error" in case:
                        stderr = f"align-dotenv: {case['followup_error']['message']}\n".encode("utf-8")
                        self.assert_safe_response(response, 2, stderr=stderr)
                    else:
                        self.assert_safe_response(response, 0,
                                                  b"Target is aligned.\n" if check else b"Target already aligned.\n")
                    self.assertTrue(target.read_bytes() == expected, "second pass modified content (payload redacted)")
                    self.assertEqual(identity(target), aligned_identity)
                self.assertTrue(template.read_bytes() == sample, "template modified (payload redacted)")
                self.assertEqual(set(Path(directory).iterdir()), {target, template})

    def test_invalid_files_never_write_or_leak(self):
        for case in load_cases("invalid"):
            for policy in case["policies"]:
                for check in (False, True):
                    with self.subTest(case=case["id"], policy=policy, check=check):
                        with tempfile.TemporaryDirectory() as directory:
                            target, template = Path(directory) / ".env", Path(directory) / "template"
                            original, sample = input_bytes(case, "local"), input_bytes(case, "template")
                            target.write_bytes(original)
                            template.write_bytes(sample)
                            before = identity(target)
                            response = run_cli(target, template, policy, check=check)
                            stderr = f"align-dotenv: {case['error']['message']}\n".encode("utf-8")
                            self.assert_safe_response(response, 2, stderr=stderr)
                            self.assertTrue(target.read_bytes() == original, "failure modified content (payload redacted)")
                            self.assertEqual(identity(target), before)
                            self.assertTrue(template.read_bytes() == sample, "template modified (payload redacted)")
                            self.assertEqual(set(Path(directory).iterdir()), {target, template})


if __name__ == "__main__":
    unittest.main()
