"""Protect verbatim required notices without network access in CI."""
import hashlib
import re
import unittest
from pathlib import Path


class NoticeTests(unittest.TestCase):
    def test_upstream_license_texts_are_retained(self):
        root = Path(__file__).resolve().parents[1]
        text = (root / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
        blocks = re.findall(r"```text\n(.*?)\n```", text, re.S)
        cpython = next(block for block in blocks if block.startswith("A. HISTORY OF THE SOFTWARE")) + "\n"
        # Exact CPython v3.13.15 LICENSE, including historical agreements.
        self.assertEqual(hashlib.sha256(cpython.encode()).hexdigest(),
                         "78b12c3a81360b357002334f0e70ea0e92eebf7a9b358805c03c48484945f3bb")
        apache = next(block for block in blocks if "TERMS AND CONDITIONS FOR USE, REPRODUCTION" in block).strip()
        # Apache text from PyInstaller v6.20.0 COPYING.txt, outer whitespace only removed.
        self.assertEqual(hashlib.sha256(apache.encode()).hexdigest(),
                         "283ea6cc2997a1a70da0049e09adf9317bb60ca1b51279b65196b83a69e1996b")
        for required in ("2008-2024 Stefan Krah", "2008-2020 Stefan Krah", "1996-2019 Julian R Seward",
                         "2016-2022 INRIA, CMU", "Copyright © 1991-2026 Unicode", "Vinay Sajip",
                         "1991, 2000, 2001 by Lucent", "2005 Don Owens", "David Gottner",
                         "Microsoft Distributable Code", "CC0 1.0 Universal"):
            self.assertIn(required, text)
