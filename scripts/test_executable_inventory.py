"""Targeted build-policy guards; no native execution on the developer machine."""
import runpy
import unittest
from pathlib import Path


class RuntimePolicyTests(unittest.TestCase):
    def test_only_os_runtime_names_are_selected(self):
        predicate = runpy.run_path(str(Path(__file__).with_name("executable-inventory.py")))["system_runtime"]
        for name in ("ucrtbase.dll", "UCRTBASE.DLL", "api-ms-win-crt-runtime-l1-1-0.dll",
                     "api-ms-win-core-file-l1-1-0.dll", "ext-ms-win-ntuser-window-l1-1-0.dll",
                     "nested\\api-ms-win-crt-heap-l1-1-0.dll"):
            self.assertTrue(predicate(name), name)
        for name in ("VCRUNTIME140.dll", "VCRUNTIME140_1.dll", "msvcp140.dll", "python313.dll",
                     "libcrypto-3.dll", "_bz2.pyd"):
            self.assertFalse(predicate(name), name)
