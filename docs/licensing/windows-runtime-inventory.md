# Windows runtime audit for v0.4.0

This is evidence, not redistribution authorization. Scope is **Windows Server
2022 x86_64 only**. WSL was used to read PE/archive data, never as execution proof.

## Original artifact and collection provenance

Original commit: `5aaccc9ddc3e5e1895d87b3d1b35bca8c0726715`.
Original native artifact: [standalone run 37508430561](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37508430561).
PyInstaller 6.20.0 CArchiveReader extracted every DLL; pefile read version
resources and imports. A runner-side original-policy rebuild in
[run 37613250951](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37613250951)
produced **identical SHA-256 for every original native DLL/PYD**, establishing
collection-source provenance rather than guessing from the filenames.

All 43 UCRT/API-set rows below have:

- file version `10.0.26100.1742 (WinBuild.160101.0800)`;
- product version `10.0.26100.1742`;
- collection source `C:\hostedtoolcache\windows\Java_Temurin-Hotspot_jdk\8.0.504-1\x64\bin\<filename>`;
- initial classification **probably redundant because OS-provided**;
- final classification **technically unnecessary, removed**.

`VCRUNTIME140.dll` has file/product version `14.51.36247.0`, collection source
`C:\hostedtoolcache\windows\Python\3.13.15\x64\VCRUNTIME140.dll`, and classification
**required by CPython/runtime**. All nine CPython/native binaries listed below
import it. No other Microsoft runtime DLL was in the archive.

The source is PyInstaller's recursive PE import/forwarded-export analysis,
not an explicit application dependency. `bindepend.resolve_library_path`
searches the binary directory, supplied paths, then PATH. The CRT API forwarders
lead to `ucrtbase.dll`, whose core API imports cause the additional 29 forwarders
to be collected. The runner's JDK directory resolved those compatibility files.

Importer abbreviations: `P` = python313.dll; `C` = libcrypto-3.dll;
`V` = VCRUNTIME140.dll; `D` = _decimal.pyd; `B` = _bz2.pyd;
`L` = _lzma.pyd; `H` = _hashlib.pyd; `S` = _socket.pyd;
`U` = unicodedata.pyd; `select` = select.pyd.
API-set exported forwarders are also dependency edges, even without PE imports.

| Original filename | Bytes | SHA-256 of extracted DLL | Importing binary / forwarding dependency |
| --- | ---: | --- | --- |
| api-ms-win-core-console-l1-1-0.dll | 22072 | `88ace577a9c51061cb7d1a36babbbefa48212fadc838ffde98fdfff60de18386` | ucrtbase.dll |
| api-ms-win-core-datetime-l1-1-0.dll | 22056 | `1bd81dfd19204b44662510d9054852fb77c9f25c1088d647881c9b976cc16818` | ucrtbase.dll |
| api-ms-win-core-debug-l1-1-0.dll | 21944 | `591358eb4d1531e9563ee0813e4301c552ce364c912ce684d16576eabf195dc3` | ucrtbase.dll |
| api-ms-win-core-errorhandling-l1-1-0.dll | 22096 | `d56ce7b1cd76108ad6c137326ec694a14c99d48c3d7b0ace8c3ff4d9bcee3ce8` | ucrtbase.dll |
| api-ms-win-core-fibers-l1-1-0.dll | 22072 | `91d249d7bc0e38ef6bcb17158b1fdc6dd8888dc086615c9b8b750b87e52a5fb3` | ucrtbase.dll |
| api-ms-win-core-fibers-l1-1-1.dll | 22072 | `fc9d86cec621383eab636ebc87ddd3f5c19a3cb2a33d97be112c051d0b275429` | ucrtbase.dll |
| api-ms-win-core-file-l1-1-0.dll | 26152 | `1ca895aba4e7435563a6b43e85eba67a0f8c74aa6a6a94d0fc48fa35535e2585` | ucrtbase.dll |
| api-ms-win-core-file-l1-2-0.dll | 22056 | `4cadbc0c39da7c6722206fdcebd670abe5b8d261e7b041dd94f9397a89d1990d` | ucrtbase.dll |
| api-ms-win-core-file-l2-1-0.dll | 21960 | `93c624b366ba16c643fc8933070a26f03b073ad0cf7f80173266d67536c61989` | ucrtbase.dll |
| api-ms-win-core-handle-l1-1-0.dll | 21944 | `39095f59c41d76ec81bb2723d646fde4c148e7cc3402f4980d2ade95cb9c84f9` | ucrtbase.dll |
| api-ms-win-core-heap-l1-1-0.dll | 22072 | `8f105771b236dbcb859de271f0a6822ce1cb79c36988dd42c9e3f6f55c5f7eb9` | ucrtbase.dll |
| api-ms-win-core-interlocked-l1-1-0.dll | 22072 | `53b25e753ca785bf8b695d89dde5818a318890211dc992a89146f16658f0b606` | ucrtbase.dll |
| api-ms-win-core-kernel32-legacy-l1-1-1.dll | 22080 | `a9b13a1cd1b8c19b0c6b4afcd5bb0dd29c0e2288231ac9e6db8510094ce68ba6` | ucrtbase.dll |
| api-ms-win-core-libraryloader-l1-1-0.dll | 22056 | `7f39ba298b41e4963047341288cab36b6a241835ee11ba4ad70f44dacd40906c` | ucrtbase.dll |
| api-ms-win-core-localization-l1-2-0.dll | 22080 | `6ee44dd0d8510dc024c9f7c79b1b9fa88c987b26b6beb6653ddd11751c34e5dc` | ucrtbase.dll |
| api-ms-win-core-memory-l1-1-0.dll | 22056 | `0512a35316ec9180437f86696a84c5c06a7e4e82e050055a656e5bf9fca206f9` | ucrtbase.dll |
| api-ms-win-core-namedpipe-l1-1-0.dll | 22096 | `c05f1fffe3b5a2738ea54ce9485cca026fb9635f982626fba1e1dcc531897273` | ucrtbase.dll |
| api-ms-win-core-processenvironment-l1-1-0.dll | 21968 | `c4eca98c3c67b6395d5b005b00ac1eb0318b86b23aa71035a44c2b1602befba9` | ucrtbase.dll |
| api-ms-win-core-processthreads-l1-1-0.dll | 22096 | `5ccb89e93d67bc3288d4e84649c5346e66e15e3d7cd65d989daf3f4cb584be9a` | ucrtbase.dll |
| api-ms-win-core-processthreads-l1-1-1.dll | 22072 | `4ad565a8ba3ef0ea8ab87221ad11f83ee0bc844ce236607958406663b407333e` | ucrtbase.dll |
| api-ms-win-core-profile-l1-1-0.dll | 22080 | `7809160932f44e59b021699f5bc68799eb7293ee1fa926d6fcca3c3445302e61` | ucrtbase.dll |
| api-ms-win-core-rtlsupport-l1-1-0.dll | 21960 | `9dc1e91e71c7c054854bd1487cb4e6946d82c9f463430f1c4e8d1471005172b1` | ucrtbase.dll |
| api-ms-win-core-string-l1-1-0.dll | 22056 | `60fc31d2a0c634412f529dba76af3b9bf991352877c6dae528186d3935704cfd` | ucrtbase.dll |
| api-ms-win-core-synch-l1-1-0.dll | 22056 | `3a72b4f29f39a265d32ad12f0ce15dbf60129c840e10d84d427829ede45e78ad` | ucrtbase.dll |
| api-ms-win-core-synch-l1-2-0.dll | 22080 | `efc1e4460984a73cf47a3def033af1c8f3b1dbc1a56cd27781d3aacf3e3330cb` | ucrtbase.dll |
| api-ms-win-core-sysinfo-l1-1-0.dll | 22072 | `b203d862ddef1dd62bf623fc866c7f7a9c317c1c2ae30d1f52cb41f955b5698e` | ucrtbase.dll |
| api-ms-win-core-sysinfo-l1-2-0.dll | 22080 | `2703635d835396afd0f138d7c73751afe7e33a24f4225d08c1690b0a371932c0` | ucrtbase.dll |
| api-ms-win-core-timezone-l1-1-0.dll | 22056 | `33f4fddc181066fce06b2227bded813f95e94ed1f3d785e982c6b6b56c510c57` | ucrtbase.dll |
| api-ms-win-core-util-l1-1-0.dll | 21944 | `6eda016742a6171205a387a14b3c0b331841567740376f56768f8c151724207d` | ucrtbase.dll |
| api-ms-win-crt-conio-l1-1-0.dll | 22056 | `b762061b688aae679afe788904d2c9970f74a7dac98f3b42463d08f25e483d3f` | P |
| api-ms-win-crt-convert-l1-1-0.dll | 26056 | `ebb2ae5535a64f65daeab8235585114fc9dd2cf1a49f5852d446250b998b6ae4` | V, D, C, P |
| api-ms-win-crt-environment-l1-1-0.dll | 22080 | `17d63275d00bdd8670422b95bd264c532998e0a1b041079e54fce4b6b7a55819` | C, P |
| api-ms-win-crt-filesystem-l1-1-0.dll | 22056 | `9a9e2a65a281644e368d0f272b95ba5f6b445d1c35910d06056c5ebeb77402db` | C, P |
| api-ms-win-crt-heap-l1-1-0.dll | 22096 | `bab9ac3ec83e380ae51e4295ef3bf2c738627812d3a49d1e713661abbc8dc57a` | V, B, D, L, C, P |
| api-ms-win-crt-locale-l1-1-0.dll | 22080 | `bd14c67ea28e21d6257ad780a37122c9b5773f69e693f5db6bffaee4d839526e` | D, P |
| api-ms-win-crt-math-l1-1-0.dll | 30248 | `606d66d82db562ea7979179d06486a0f94d079941d26b80a1e2c49d29959df6f` | D, P |
| api-ms-win-crt-process-l1-1-0.dll | 22096 | `f6156b1020380ec4f0e48577ebedaaef5fb1ab1f337d8b4e72e6a33a7567a9cc` | P |
| api-ms-win-crt-runtime-l1-1-0.dll | 26152 | `c5902934d026d7e15fbe9917d474f3322846a41a25e66f4b2b1f758801879f4b` | V, B, D, H, L, S, C, P, select, U |
| api-ms-win-crt-stdio-l1-1-0.dll | 26168 | `a9c5a153d8c0286f9b41a2b1c65854ad9e6471b8755b7de87bae4470e60bcab6` | V, B, D, S, C, P, U |
| api-ms-win-crt-string-l1-1-0.dll | 26176 | `25b8f83a7767211b11132775a0e27a45aa4ec8ab4e6572599f9c172ae3606b40` | V, D, H, S, C, P, U |
| api-ms-win-crt-time-l1-1-0.dll | 22096 | `7c7f6393f06de11750adb09cc5698ae55cd9fb27b2e51e207286feb1b5b2b156` | C, P |
| api-ms-win-crt-utility-l1-1-0.dll | 21952 | `d8ba5f17b9ffcbf3aeaf3fa1da226832d2fa90f81acce0cd669464e76ce434ac` | C |
| ucrtbase.dll | 1361448 | `2e5fb14b7bf8540278f3614a12f0226e56a7cc9e64b81cbd976c6fcf2f71cbfb` | CRT API-set exported forwarders |
| VCRUNTIME140.dll | 178616 | `d1f4225df2cd877dbf130d5668a021dce3f94118455ff5ec952061c30afc9ce7` | B, D, H, L, S, C, P, select, U |

## Intentional exclusion, not executable surgery

Microsoft [Universal CRT deployment](https://learn.microsoft.com/en-us/cpp/windows/universal-crt-deployment)
states UCRT is an OS component on Windows Server 2016 and later; local deployment
is not recommended. PyInstaller 6.20.0
[`depend/dylib.py`, lines 139–148](https://github.com/pyinstaller/pyinstaller/blob/v6.20.0/PyInstaller/depend/dylib.py)
explicitly includes `api-ms-win-core.*`, `api-ms-win-crt.*`, and `ucrtbase.dll`
for compatibility, with a comment that Windows 10+ targets need not bundle them.

`build-executable.py` generates the normal pinned onefile specification. After
`Analysis` finishes dependency discovery, `executable-inventory.py` records the
source TOC, versions, hashes and import edges. It removes `ucrtbase.dll`,
`api-ms-win-*` and `ext-ms-win-*` entries from **Analysis.binaries**, before
`PYZ`, `EXE` and `PKG` collection. The broad API-set predicate covers future
OS contract forwarders too, not arbitrary DLLs or VC runtime names. Linux is
unchanged. Post-build CArchive inspection fails if an excluded name reappears.
The unfiltered discovery report explains collection sources even for removed
files; it is not embedded in the executable or npm tarballs.

`bundled` and `no-vcr` policies are diagnostic-only variants. Only the default
`system` output enters standalone/npm release-candidate assembly. Diagnostics
are in separate directories and are never platform package inputs.

## Clean Server 2022 necessity proof

The first successful native proof is commit
`f1fcc9b5157d1f5315be01915a052e7520e3dc26`, run 37613250951. It ran both full
standalone suites and the existing safety/embedded-code/leak gates. Windows also
ran an unmodified `mcr.microsoft.com/windows/servercore:ltsc2022` container:

- image digest `sha256:76cf422c98ca437b308374d0498280541fa42ac7061bb44015a6c8b70cf4db6a`;
- no Python installed, no `C:\Windows\System32\vcruntime140.dll`;
- system UCRT present, container invoked with `--network none`;
- default minimized artifact passed help, explicit/project mode and exits 0/1/2;
- separately built no-VCR artifact failed: `Failed to load Python DLL ... python313.dll`, exit `-1`;
- minimized archive: **one Microsoft runtime DLL**, VCRUNTIME140.dll.

The full standalone safety suite remains on the hosted Windows runner, which
supports symlinks/hard links and Windows replacement semantics. The clean
container is an additional isolation/necessity/network proof, not a substitute
or a weakened suite. No local x64 Windows development machine is required.

## Entitlement is a separate question

| Item | Technical disposition | Licensing status |
| --- | --- | --- |
| UCRT | OS-provided; not redistributed in minimized artifact | RESOLVED |
| API-set DLLs | OS-provided; all 42 removed | RESOLVED |
| VCRUNTIME140.dll | Required, retained with identical hash/version above | MAINTAINER CONFIRMATION REQUIRED |
| Microsoft code incorporated in CPython binaries | Not eliminated by DLL filtering; see PC/crtlicense.txt | MAINTAINER CONFIRMATION REQUIRED |
| Microsoft CRT incorporated in Windows bootloader | Outer PE imports USER32/KERNEL32/ADVAPI32 only; Visual C++ CRT strings/Rich header and static-toolchain build evidence | MAINTAINER CONFIRMATION REQUIRED |

The DLL's presence on the runner, in CPython, or in a Microsoft redistribution
file list is **not** proof of this maintainer's entitlement. Confirm the
applicable Microsoft license, downstream terms, and the right to redistribute
this exact Python-supplied runtime. Microsoft describes this independently in
[Redistributing Visual C++ files](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files).
CPython v3.13.15 `PC/crtlicense.txt` also requires protective downstream terms
for Microsoft Distributable Code; its full notice is retained in our draft.
Do not set `licensingAuditComplete` or authorize publication merely because the
clean-container test passes.
