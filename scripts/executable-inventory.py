#!/usr/bin/env python3
"""Runner-side evidence, kept outside release/package allowlists."""
import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path


def system_runtime(name):
    name = name.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return name == "ucrtbase.dll" or name.startswith(("api-ms-win-", "ext-ms-win-"))


def pe_details(data):
    import pefile

    pe = pefile.PE(data=data)
    strings = {}
    for group in getattr(pe, "FileInfo", []):
        for item in group:
            for table in getattr(item, "StringTable", []):
                strings.update({k.decode(): v.decode(errors="replace") for k, v in table.entries.items()})
    result = {
        "file_version": strings.get("FileVersion"),
        "product_version": strings.get("ProductVersion"),
        "company": strings.get("CompanyName"),
        "imports": sorted({entry.dll.decode() for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])}),
    }
    pe.close()
    return result


def record_analysis(analysis, output, policy):
    """Called by the spec after Analysis, before PYZ/EXE/PKG collection."""
    rows = []
    for name, source, kind in analysis.binaries:
        path = Path(source)
        row = dict(filename=name, source=source, kind=kind)
        if kind != "SYMLINK":
            data = path.read_bytes()
            row.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            if sys.platform == "win32":
                row.update(pe_details(data))
            else:
                query = subprocess.run(["dpkg-query", "-S", str(path.resolve())], capture_output=True, text=True)
                row["system_package"] = query.stdout.strip() or None
        row["excluded"] = sys.platform == "win32" and (
            policy != "bundled" and system_runtime(name)
            or policy == "no-vcr" and name.lower() == "vcruntime140.dll"
        )
        rows.append(row)
    for row in rows:
        row["importers"] = sorted(r["filename"] for r in rows if row["filename"].lower() in
                                  [dep.lower() for dep in r.get("imports", [])])
    import ssl
    import zlib
    import _decimal

    report = dict(platform=platform.platform(), python=sys.version, policy=policy,
                  openssl=ssl.OPENSSL_VERSION, zlib=zlib.ZLIB_RUNTIME_VERSION,
                  libmpdec=_decimal.__libmpdec_version__, binaries=rows,
                  scripts=list(analysis.scripts), pure=list(analysis.pure))
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "analysis.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    analysis.binaries = [entry for entry, row in zip(analysis.binaries, rows) if not row["excluded"]]


def record_archive(artifact, output, policy):
    from PyInstaller.archive.readers import CArchiveReader

    archive = CArchiveReader(str(artifact))
    rows = []
    for name, entry in archive.toc.items():
        data = archive.extract(name)
        row = dict(filename=name, type=entry[-1], bytes=len(data or b""),
                   sha256=hashlib.sha256(data or b"").hexdigest())
        if data and data[:2] == b"MZ":
            row.update(pe_details(data))
        rows.append(row)
    if sys.platform == "win32" and policy != "bundled":
        assert not any(system_runtime(row["filename"]) for row in rows), "OS runtime reintroduced"
        if policy == "no-vcr":
            assert not any(row["filename"].lower() == "vcruntime140.dll" for row in rows)
    report = dict(filename=artifact.name, bytes=artifact.stat().st_size,
                  sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(), entries=rows,
                  modules=sorted(archive.open_embedded_archive("PYZ.pyz").toc))
    (Path(output) / "archive.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
