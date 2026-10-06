# Binary third-party notice inventory — release review required

This is an inventory and attribution draft, **not a complete license bundle**.
Do not redistribute the candidate binaries until the licensing audit is approved.
The application and launcher are MIT licensed; that does not replace the licenses
of the interpreter, bootloader, embedded libraries or Microsoft runtime DLLs.

## Observed components

The Phase 3 x64 artifacts were inspected with PyInstaller's CArchiveReader:

| Component | Observed artifact content | Licensing source / required review |
| --- | --- | --- |
| CPython 3.13.15 | libpython3.13.so.1.0 / python313.dll, standard library and C extensions | PSF and historical agreements, plus incorporated code notices: https://github.com/python/cpython/blob/v3.13.15/LICENSE and https://github.com/python/cpython/blob/v3.13.15/Doc/license.rst |
| PyInstaller 6.20.0 | bootloader, pyimod loaders, bootstrap, pyi_rth_inspect | GPL-2.0-or-later with bootloader exception for compiled combinations; runtime hooks Apache-2.0: https://github.com/pyinstaller/pyinstaller/blob/v6.20.0/COPYING.txt |
| OpenSSL | Linux libcrypto.so.3 / Windows libcrypto-3.dll | OpenSSL 3 uses Apache-2.0. Resolve the actual build version and accompanying NOTICE/copyright: https://github.com/openssl/openssl |
| bzip2 | Linux libbz2.so.1.0 / Windows _bz2.pyd | Retain the actual bzip2 copyright, conditions and disclaimer; determine statically linked Windows version: https://sourceware.org/bzip2/ |
| XZ/liblzma | Linux liblzma.so.5 / Windows _lzma.pyd | Component-specific licenses; inspect the actual library build and source. Do not assume the entire XZ project is public domain: https://tukaani.org/xz/ |
| zlib | Linux libz.so.1 / zlib runtime code | zlib license and copyright; identify the bundled version: https://zlib.net/zlib_license.html |
| Microsoft runtime | Windows VCRUNTIME140.dll, ucrtbase.dll, api-ms-* DLLs | Confirm permitted redistribution and applicable terms for the CPython installer/build toolchain. Do not infer entitlement from a DLL's presence: https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files |

CPython also incorporates code with its own notices (including hashing, random
number generation, decimal arithmetic and numeric conversion). Its license
documentation explicitly calls its list incomplete. Final review must account
for the actual archived modules and statically incorporated components, not just
the shared-library filenames. Test packages and build-only dependencies must not
be indiscriminately attributed as shipped runtime components.

## Modification summary

align-dotenv embeds the interpreter and canonical application through PyInstaller;
it does not intentionally modify CPython or PyInstaller sources. Linux binaries
are stripped to remove debug data. No runtime downloading is performed.

## Outstanding release requirement

Replace/complete this draft with the full required license texts and applicable
notices, and confirm Windows redistribution rights before setting
`release-policy.json: licensingAuditComplete` to true. The file is supplied with
candidate artifacts and npm platform packages to make the unresolved audit
explicit, not to claim that hyperlinks satisfy notice obligations.
