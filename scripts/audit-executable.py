#!/usr/bin/env python3
"""Audit unpacked PyInstaller contents, not just compressed binary strings."""
import json
import marshal
import os
import sys
from pathlib import Path
from types import CodeType

from PyInstaller.archive.readers import CArchiveReader


def main():
    root = Path(__file__).resolve().parent.parent
    artifact = Path(sys.argv[1])
    # Known shared-fixture payloads must never be packaged with the implementation.
    markers = {"private-value", "example-secret", "local-value", str(root), str(Path.home())}
    for group in ("reconciliation", "invalid"):
        cases = json.loads((root / "fixtures" / group / "cases.json").read_text())["cases"]
        for case in cases:
            for field in ("local", "template"):
                payload = case.get(field)
                if payload and len(payload) >= 16:
                    markers.add(payload)
    encoded = [marker.encode() for marker in markers]
    archive = CArchiveReader(str(artifact))
    for name in archive.toc:
        payload = archive.extract(name)
        if payload:
            assert not any(marker in payload for marker in encoded), "unpacked path/fixture leak"
    modules = archive.open_embedded_archive("PYZ.pyz")
    for name in modules.toc:
        code = modules.extract(name)
        if not isinstance(code, CodeType):
            continue
        assert not any(marker in marshal.dumps(code) for marker in encoded), "module path/fixture leak"
        if name.startswith("align_dotenv"):
            pending = [code]
            while pending:
                current = pending.pop()
                assert not os.path.isabs(current.co_filename), "absolute canonical source path"
                pending.extend(value for value in current.co_consts if isinstance(value, CodeType))
    print("Unpacked executable archive and modules: no known fixture values or personal/checkout paths")


if __name__ == "__main__":
    main()
