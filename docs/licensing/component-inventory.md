# v0.4.0 shipped component inventory

Scope: Ubuntu 24.04 x86_64 and Windows Server 2022 x86_64. The project/launcher
are MIT. This ledger is **not publication approval**: retained Microsoft code
still requires maintainer confirmation. `release-policy.json` remains fail-closed.

## Evidence and interpretation

The original runner archives at commit `5aaccc9` and minimized runner builds at
`f1fcc9b` were inspected, including PYZ modules, the bootstrap archive and native
files. Runner `analysis.json` records resolved sources, sizes, SHA-256, PE
versions/imports and selected scripts/pure modules. `archive.json` independently
records what actually ships. Linux collection hashes are pre-strip; archive
hashes are post-strip. These are different records, not interchangeable hashes.
Evidence is uploaded separately as `licensing-*` / `npm-licensing-*`; it never
enters release/tarball allowlists. Future exact-commit builds rerun this audit.

Version evidence is a runtime measurement where available. Windows statically
incorporated bzip2/liblzma versions are explicitly **build references**, from
CPython's exact `PCbuild/python.props`, not inferred from their `.pyd` file
versions (those resources report CPython's version).

`RESOLVED` in an OSS row means applicable OSS notice/license handling, not that
the entire Windows distribution is authorized. Microsoft incorporated code is
a separate mandatory row. Full applicable texts are now appended to
`THIRD_PARTY_NOTICES.md`, whose draft/fail-closed status is deliberately retained
until the maintainer confirms the outstanding Microsoft terms and entitlement.

## Inventory

| Component/version | Artifact / shipped form | License and required notice treatment | Evidence | Status |
| --- | --- | --- | --- | --- |
| CPython 3.13.15 | Both: libpython3.13.so.1.0 / python313.dll, selected stdlib bytecode and native extensions | PSF-2.0 + BeOpen/CNRI/CWI historical stack; full LICENSE, copyright and packaging/modification summary reproduced; additional incorporated notices below | Native metadata/PE version; v3.13.15 LICENSE, Doc/license.rst and named source headers | RESOLVED |
| PyInstaller bootloader and related loaders 6.20.0 | Both: bootloader, pyimod01_archive, pyimod02_importers, pyimod03_ctypes, pyiboot01_bootstrap; Windows also pyimod04_pywin32 | GPL-2.0-or-later WITH Bootloader-exception; combined executables permitted without blanket application GPL obligations; attribution and exception reproduced | Pinned installed version, CArchive entries, upstream v6.20.0 COPYING.txt and loader/bootloader headers | RESOLVED |
| PyInstaller pyi_rth_inspect 6.20.0 | Both: embedded runtime hook, not a build-only hook | Apache-2.0; full license and source copyright reproduced; unmodified; no upstream top-level NOTICE | CArchive scripts, Analysis.scripts, upstream hooks/rthooks/pyi_rth_inspect.py and COPYING.txt | RESOLVED |
| OpenSSL 3.0.13 (Linux), 3.0.21 (Windows) | Both: bundled libcrypto.so.3 / libcrypto-3.dll, referenced by _hashlib; no libssl shipped | Apache-2.0; full license and attribution reproduced; upstream release trees have no top-level NOTICE | Runner ssl.OPENSSL_VERSION, native Windows PE resource, Linux package/source, exact upstream LICENSE.txt | RESOLVED |
| bzip2 1.0.8 | Linux bundled libbz2.so.1.0; Windows incorporated in _bz2.pyd | bzip2-1.0.6 license family; 1.0.8 full actual copyright/terms/disclaimer reproduced | Linux extracted version string; Windows v3.13.15 PCbuild/python.props selects bzip2-1.0.8; upstream 1.0.8 LICENSE | RESOLVED |
| liblzma 5.4.5 (Linux), build reference 5.2.5 (Windows) | Linux bundled liblzma.so.5; Windows incorporated in _lzma.pyd | Public-domain/liberal alternative grant for liblzma; relevant text and acknowledgment reproduced; not blanket GPL attribution for XZ | Linux resolved library filename/package; Windows PCbuild/python.props; exact XZ release COPYING and liblzma source licensing | RESOLVED |
| zlib 1.3 (Linux runtime), 1.3.1 (Windows interpreter), 1.3.2 (Windows bootloader) | Linux bundled libz.so.1; Windows incorporated in python313.dll and bootloader | zlib; actual copyright years and full conditions/disclaimer reproduced | Runner zlib.ZLIB_RUNTIME_VERSION; Windows python.props; bootloader/wscript + bootloader/zlib/zlib.h; uncompressed Windows inflate copyright string | RESOLVED |
| libmpdec 2.5.1 (Linux), 4.0.0 (Windows) | Both: incorporated in _decimal extension; no separate libmpdec shared library ships | BSD-2-Clause; both version-specific copyrights/full notices reproduced | Runner _decimal.__libmpdec_version__; Windows python.props; CPython libmpdec headers and cpython-source-deps/mpdecimal-4.0.0/COPYRIGHT.txt | RESOLVED |
| HACL* revision bb3d0dc8d9d15a5cd51094d5b69e70aa09005ff0, KaRaMeL headers; BLAKE2 CPython-vendored snapshot | Both: built-in / extension hashing code | HACL MIT; KaRaMeL Apache-2.0; BLAKE2 CC0-1.0; all applicable notices and full license texts reproduced, including CC0 dedication | v3.13.15 Modules/_hacl/refresh.sh and source headers; Modules/_blake2/impl; Linux hash-extension entries; Windows PC/config.c builtin module definitions | RESOLVED |
| mimalloc 2.1.2 | Both: incorporated in interpreter, not a separate DLL | MIT; source/documentation copyright and full license reproduced; distinct from proprietary MS runtime | Include/internal/mimalloc/mimalloc.h MI_MALLOC_VERSION=212; Linux WITH_MIMALLOC=1; Windows PC/pyconfig.h.in WITH_MIMALLOC=1; Doc/license.rst | RESOLVED |
| Unicode Character Database 15.1.0 | Both: interpreter data and unicodedata extension | Unicode-3.0; full Unicode License V3/copyright reproduced from exact CPython documentation | Modules/unicodedata_db.h, Doc/license.rst and archived unicodedata extensions | RESOLVED |
| Mersenne Twister, SipHash, dtoa/strtod, cfuhash-derived hashtable, interpreter getopt, Unicode string implementation | Both: incorporated interpreter/selected native modules | BSD-3-Clause / MIT / permissive custom notices; complete applicable copyright, conditions and disclaimers reproduced per named source | Modules/_randommodule.c; Python/pyhash.c, dtoa.c, hashtable.c, getopt.c; Objects/unicodeobject.c | RESOLVED |
| logging, tarfile and PSF-contributor stdlib code | Both: selected PYZ/base-library contents | Vinay Sajip permissive license, Lars Gustaebel MIT, PSF contributor agreements/Python stack; applicable notices retained | Actual module lists matched to Lib source headers; logging and tarfile complete license notices reproduced | RESOLVED |
| UCRT | Windows: dynamically referenced, OS supplied, NOT bundled | No redistributed UCRT payload; removing redundant local copy avoids its redistribution question | Microsoft Universal CRT deployment; clean Server 2022 execution and post-build archive assertion | RESOLVED |
| API-set DLLs | Windows: OS contracts dynamically resolved, NOT bundled | All original 42 local compatibility DLLs removed; no redistributed API-set payload | Microsoft/PyInstaller behavior; exact original inventory; clean OS test and post-build assertion | RESOLVED |
| VCRUNTIME140.dll 14.51.36247.0 | Windows: bundled from CPython toolcache, required by python313.dll and eight other native binaries | Proprietary Microsoft terms; technical necessity does not prove entitlement; exact origin/hash in runtime ledger | Analysis source path + PE imports/hash; clean Server 2022 no-VCR failure; Microsoft redistributing-visual-cpp-files | MAINTAINER CONFIRMATION REQUIRED |
| Microsoft Distributable Code incorporated by CPython's Windows linker | Windows: incorporated in exe/dll/pyd, not eliminated by removing DLL copies | CPython's additional Windows conditions reproduced; maintainer must confirm applicable Microsoft/downstream protections | Exact CPython v3.13.15 PC/crtlicense.txt | MAINTAINER CONFIRMATION REQUIRED |
| Microsoft CRT incorporated in Windows PyInstaller bootloader | Windows: statically incorporated toolchain runtime, not a separately archived DLL | Microsoft toolchain redistribution terms require confirmation independently of the PyInstaller source-code exception | Outer PE imports only USER32/KERNEL32/ADVAPI32; Rich header and uncompressed Visual C++ CRT/.CRT strings; bootloader/wscript MSVC static runtime build configuration | MAINTAINER CONFIRMATION REQUIRED |

## System dependencies and excluded material

- Linux glibc/loader/libm/libdl/libpthread are dynamically referenced OS
  components, not archived payloads. The Linux bootloader dynamically references
  **OS** libz.so.1 before it extracts the archive; the interpreter archive also
  contains the identified runtime libz. A bootloader `1.3.2` header-version string
  does not prove another static zlib copy in the Linux executable.
- Windows kernel/WinSock/other OS imports are supplied by Server 2022. The
  proprietary DLL inventory counts archive payloads, not every PE import.
- No extra native shared-library family beyond the rows above was found.
- No Tcl/Tk, SQLite, Expat, libffi, readline, ncurses, libssl, or GPL XZ command
  tools were present in these archives. Build-only altgraph, packaging,
  setuptools, pywin32-ctypes and pyinstaller-hooks-contrib are not attributed as
  shipped packages.
- CPython test-only asyncore/asynchat, XML-RPC/http cookie/trace modules, W3C
  test data, asyncio/uvloop and kqueue interfaces are not in these selected
  platform contents. The source's WIDE getaddrinfo/getnameinfo fallback is not
  used with native platform resolver support. No claim that every item in
  CPython's deliberately incomplete documentation list is shipped is made.

## Remaining release decision

**LICENSING NOT READY FOR v0.4.0.** The technical UCRT/API-set blocker is reduced
to one required Microsoft DLL plus incorporated Microsoft linker code. Obtain
maintainer confirmation of the applicable redistribution grant and downstream
terms. Only then review/promote the notice draft and consider changing the
fail-closed licensing policy. Passing CI is not a substitute for that decision.
