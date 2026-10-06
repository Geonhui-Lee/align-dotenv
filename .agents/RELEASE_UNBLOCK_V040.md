# v0.4.0 publication-unblock audit

This audit separates repository work from account administration and unresolved
redistribution review. It does not authorize publication or constitute legal advice.
`release-policy.json` approvals remain false; `THIRD_PARTY_NOTICES.md` remains an
incomplete draft. Do not remove that warning merely because technical CI passes.

## Evidence boundary

Entry revision: `250307cc903c6c1418400d679467bf3bb9335562`, release/v0.4.0.
Inspected the downloaded `release-candidate-250307cc903c6c1418400d679467bf3bb9335562`
from native npm run `37498438464`, not a locally rebuilt replacement. Checksums:

| Binary | Bytes | SHA-256 |
| --- | ---: | --- |
| align-dotenv-v0.4.0-linux-x64 | 7415248 | aa56a683966fd5ccbd5745babe3d5f26d15efc636507e6726c56c2cb0696d129 |
| align-dotenv-v0.4.0-windows-x64.exe | 8308317 | 10082c2e4faecca5b1bceed16f60631a81f7eb36fc5ff4af8281b8af88975be4 |

Tools: PyInstaller 6.20.0 CArchiveReader/PYZ reader, ELF `readelf -d`, native
library strings, pefile 2024.8.26 PE imports/version resources, CPython v3.13.15
source/build properties. ELF dependencies were inspected without executing
extracted libraries. PE imports alone were not used as evidence of bundling.
The Linux CArchive has 52 entries, Windows 63. Both have a 154-member
base_library.zip, PYZ application/stdlib code, bootloader/loaders and inspect hook.
Linux has 38 extension-module files; Windows has seven .pyd files, with additional
builtin modules compiled into python313.dll. No toolchain-only Python packages
(pip, setuptools, altgraph, hooks-contrib, build, twine, pefile) are attributed as
runtime dependencies just because they were installed during build/audit.

## Bundled component inventory and required action

Versions from strings/PE resources identify upstream versions, not complete
Ubuntu package revisions, patchsets, or the provenance of statically linked code.
Windows source build defaults below are corroborating evidence, not a substitute
for exact distributor build records. All rows marked required remain missing
from the current draft notice bundle.

| Component/version | How distributed | License evidence and action |
| --- | --- | --- |
| CPython 3.13.15 | Linux libpython3.13.so.1.0, extension DSOs; Windows python313.dll/.pyd; both stdlib archives | Exact [LICENSE](https://github.com/python/cpython/blob/v3.13.15/LICENSE): PSF-2.0 plus BeOpen, CNRI and CWI historical terms, and zero-clause BSD for covered documentation examples. Retain applicable agreements/copyrights; include a brief modification summary. Required; application MIT is not a replacement. No source-disclosure obligation follows from these permissive terms. |
| PyInstaller 6.20.0 bootloader/loaders/bootstrap | Embedded compiled bootloader, pyimod01_archive, pyimod02_importers, pyimod03_ctypes and bootstrap | [COPYING.txt](https://github.com/pyinstaller/pyinstaller/blob/v6.20.0/COPYING.txt) explicitly exempts combined executables using bootloader and PyInstaller/loader files. No GPL text, credit, or application source disclosure is required merely for this unmodified combined executable. Do not add a blanket GPL notice for the generated executable. Separate redistribution/modification of PyInstaller itself has different obligations. |
| PyInstaller pyi_rth_inspect, 6.20.0 | Actual compiled runtime hook present in both CArchives | [Hook header](https://github.com/pyinstaller/pyinstaller/blob/v6.20.0/PyInstaller/hooks/rthooks/pyi_rth_inspect.py): Apache-2.0, copyright 2021–2023 PyInstaller Development Team. COPYING specifically separates runtime hooks from bootloader exception. Supply Apache-2.0 text, preserve applicable attribution/NOTICE material and identify modifications if any. Required; general documentation's no-PyInstaller-license summary should not erase this distinct hook license. |
| OpenSSL/libcrypto 3.0.13 Linux, 3.0.21 Windows | libcrypto.so.3 / libcrypto-3.dll inside CArchive; loaded by _hashlib | Version strings/PE resources; upstream versioned LICENSE.txt ([Linux](https://github.com/openssl/openssl/blob/openssl-3.0.13/LICENSE.txt), [Windows](https://github.com/openssl/openssl/blob/openssl-3.0.21/LICENSE.txt)): Apache-2.0. Include license and applicable attribution/NOTICE material; review corresponding COPYRIGHT and distributor patches. Required. No libssl or _ssl member was found; do not list TLS libraries merely because OpenSSL is present. |
| bzip2 1.0.8 | Linux libbz2.so.1.0; Windows statically incorporated in _bz2.pyd (1.0.8, 13-Jul-2019 string) | [1.0.8 source archive](https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz), LICENSE: retain copyright, conditions and disclaimer; no endorsement. Include exact license text. Required. |
| liblzma 5.4.5 Linux; Windows 5.2.5 build default, not independently version-confirmed | liblzma.so.5; Windows statically incorporated in _lzma.pyd, no separate lzma DLL import | Version string on Linux; [CPython python.props](https://github.com/python/cpython/blob/v3.13.15/PCbuild/python.props) and liblzma.vcxproj for Windows. [5.4.5](https://github.com/tukaani-project/xz/blob/v5.4.5/COPYING) / [5.2.5](https://github.com/tukaani-project/xz/blob/v5.2.5/COPYING) describe liblzma as public domain, attribution polite rather than required. Do not impose XZ command-line tools' GPL/LGPL on liblzma. Confirm exact Windows build and any distributor/toolchain additions before closing this row. |
| zlib 1.3 Linux; Windows 1.3.1 build default | libz.so.1 inside Linux CArchive; Windows builtin zlib code in python313.dll, no zlib DLL import | Linux string; CPython python.props pins Windows source to zlib-1.3.1. [zlib license](https://zlib.net/zlib_license.html): no misrepresentation; altered source marked; notice retained in source distributions. Binary acknowledgment is appreciated, not required by this text. Preserve upstream license/attribution in final consolidated bundle and verify Windows distributor version. Do not claim the license requires a binary credit screen. |
| libmpdec (2.5.1 CPython source default) | _decimal DSO/.pyd; no separate libmpdec dynamic dependency | [mpdecimal.h](https://github.com/python/cpython/blob/v3.13.15/Modules/_decimal/libmpdec/mpdecimal.h): Stefan Krah copyright and BSD-2-Clause terms, including explicit binary-documentation notice requirement. Required; confirm distributor incorporated sources/version. |
| HACL* snapshot incorporated in CPython | Linux _md5/_sha1/_sha2/_sha3 DSOs; Windows builtin hashing implementations | [Hacl_Hash_SHA2.c](https://github.com/python/cpython/blob/v3.13.15/Modules/_hacl/Hacl_Hash_SHA2.c) and adjacent files: MIT, INRIA/CMU/Microsoft and HACL contributors. Retain copyright and permission notice for incorporated files/support code. Required; resolve upstream snapshot via refresh.sh and distributor source records, not an invented independent version. |
| BLAKE2 reference implementation | Linux _blake2 DSO; Windows CPython builtin implementation | [blake2.h](https://github.com/python/cpython/blob/v3.13.15/Modules/_blake2/impl/blake2.h): Samuel Neves, CC0 public-domain dedication, no warranty. Record applicable dedication; not an additional GPL/copyleft obligation. |
| Microsoft VCRUNTIME140.dll 14.51.36247.0 | Actual DLL in Windows CArchive | PE version resource; [Microsoft redistribution guidance](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files) limits redistribution to licensed Visual Studio users subject to applicable terms. Determine entitlement and exact permitted redist file/toolchain; PSF/MIT does not sublicense it. STILL UNRESOLVED; a copyright line is not redistribution authorization. |
| Microsoft UCRT/API-set files 10.0.26100.1742 | Actual ucrtbase.dll and 42 api-ms-win-core*/api-ms-win-crt* DLLs inside Windows CArchive | PE version resources and CArchive entries, not an inference from imports. Review applicable Windows SDK/UCRT distributable-file terms and acquisition route; Visual C++ guidance alone does not settle all these files. STILL UNRESOLVED. |

### System-provided, not shipped

ELF DT_NEEDED closure, minus CArchive library members: ld-linux-x86-64.so.2,
libc.so.6, libdl.so.2, libm.so.6 and libpthread.so.0. These glibc runtime files
are not bundled; their mere dynamic reference does not create an obligation to
ship glibc source/notices with this candidate. Bundled Python requires GLIBC_2.38.

Windows PE import closure, minus CArchive DLLs: advapi32.dll,
api-ms-win-core-path-l1-1-0.dll, bcrypt.dll, iphlpapi.dll, kernel32.dll,
rpcrt4.dll, user32.dll, version.dll and ws2_32.dll. These are target Windows
dependencies, not copied payloads. The other 42 API-set DLLs and UCRT above
**are** copied and cannot be dismissed as system imports.

### Remaining source-level audit, not a complete license bundle

The CPython LICENSE alone does not exhaust incorporated-code notices. Its
[license documentation](https://github.com/python/cpython/blob/v3.13.15/Doc/license.rst)
explicitly labels the incorporated-software list incomplete. Resolve remaining
core/stdlib incorporated notices against the exact build: e.g. dtoa numeric
conversion, Mersenne Twister random implementation and multibyte codecs. Do not
count each PSF stdlib module as an independent third-party project, or include
libffi/Tcl/Tk/sqlite/Expat merely because a full Python installation may contain
them; those separate library members were not found in these archives.

The final bundle needs full applicable Python/historical agreements, incorporated
code notices, Apache text and applicable OpenSSL/hook notices, bzip2 text and
libmpdec/HACL notices. Exact distributor patch/source records and Microsoft
entitlement are still missing. Leaving THIRD_PARTY_NOTICES unchanged is intentional:
this maintainer audit is not a recipient-facing substitute for full license texts.

## npm account-side findings and precise prerequisite sequence

Read-only registry check: align-dotenv latest 0.3.1, public maintainer geonhui
(geonhui@aol.com); dist.attestations advertises SLSA provenance. Public provenance
metadata does not prove current private Trusted Publisher settings/permissions.
Both scoped package endpoints return 404; that proves no public package view,
not name availability, absence of a private package, or ownership of the scope.

Sources: [scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages),
[Trusted Publishers](https://docs.npmjs.com/trusted-publishers),
[staged publishing](https://docs.npmjs.com/staged-publishing). Current docs support
an account-authenticated staged bootstrap: staging a previously nonexistent
package publishes a **public 0.0.0-stage placeholder** while staged contents wait
for approval. This requires npm >=11.15.0 and Node >=22.14.0. It is a registry
mutation and forbidden in this task, even without stage approval.

Before any first publication (maintainer only, separate explicit authorization):

1. Confirm control of npm user/org scope align-dotenv and publish access for the
   maintainer/team. Ownership of unscoped align-dotenv does not grant scope rights.
   If absent, create/claim the appropriate npm organization with that exact name;
   a geonhui personal scope is not a replacement. Confirm both package names are
   usable under that account, including any private/staged package state.
2. Confirm initial package-creation route with npm. Trusted Publisher setup is
   documented in **per-package settings**; no pre-package OIDC registration route
   was established. Do not assume an OIDC 404 will create a configured publisher.
3. Prefer investigating npm's documented authenticated stage/placeholder route,
   rather than manually consuming immutable 0.4.0. After licensing clearance and
   separate bootstrap authorization, the maintainer may stage each exact reviewed
   tarball with public access, then verify placeholder state and whether settings
   allow registering its Trusted Publisher before the real version is approved.
   Confirm handling/rejection of the staged 0.4.0 payload with npm; this audit does
   not prove that placeholders permit this entire OIDC handoff without a release.
4. If placeholder handoff is unavailable, a one-time account-authenticated public
   bootstrap is needed before future OIDC setup. Obtain a separately approved
   bootstrap version/content plan; do not invent dummy 0.4.0 packages. A manual
   0.4.0 publish lacking provenance cannot be skipped by our current recovery guard.
   Human login/2FA is preferable to introducing any long-lived automation token.
5. Once each package has settings, register the exact identities below, allow
   direct `npm publish` (stage-only is insufficient), and confirm repository.url.
   Both platform packages have public access passed explicitly by the workflow.
   New configurations may expire after two days without a successful publish;
   create/recheck them near a separately authorized publication window.
6. Confirm existing main publisher independently. Future OIDC releases publish
   platform packages first and verify integrity/provenance before main. Do not
   weaken provenance recovery to accommodate a manual first publication.

Thus an account-authenticated bootstrap/setup step is required absent an npm-
confirmed precreation route; **a manually published real 0.4.0 is not proven
mandatory**. The exact placeholder-to-OIDC handoff remains REQUIRES MAINTAINER ACTION.

## Exact publisher identities to confirm externally

| Registry/project or package | GitHub owner | Repository | Workflow filename | Environment |
| --- | --- | --- | --- | --- |
| npm align-dotenv | Geonhui-Lee | align-dotenv | publish-npm.yml | npm |
| npm @align-dotenv/linux-x64 | Geonhui-Lee | align-dotenv | publish-npm.yml | npm |
| npm @align-dotenv/win32-x64 | Geonhui-Lee | align-dotenv | publish-npm.yml | npm |
| PyPI align-dotenv | Geonhui-Lee | align-dotenv | publish.yml | pypi |

Private external configuration was not read; maintainer must confirm these exact
values, current validity and direct-publish permission for each npm package.

## GitHub environment policy and flags

Read-only GitHub API: npm permits branch develop and tags v*, has no required
reviewers or wait timer, admin bypass enabled. pypi has no branch/tag policy,
reviewers or wait timer, admin bypass enabled. Current settings do not implement
the intended human-approved release-only policy.
Read-only environment secret-name and variable-name listings were empty for both
environments; no secret values were requested or exposed.

Maintainer/admin actions for **each** environment:

- Set selected deployment tags to v* (the workflow further restricts v0.4.0),
  not branches. Remove npm's historical develop branch permission; exact-source
  recovery no longer needs it. Add pypi tag restriction.
- Configure designated release reviewer(s), prevent self-review where feasible,
  and disallow admin bypass. GitHub required reviewers require one configured
  reviewer to approve, not necessarily every reviewer; confirm the repository
  plan and maintainer availability support the intended human approval.
- No wait timer is required by this policy; set one only if independently desired.
- Use OIDC only: publishing jobs have id-token:write. No npm token/PyPI API token
  or account credentials are required as environment secrets. Never dump secrets
  to verify this; admins should inspect names/settings and remove unused legacy
  publishing credentials through a separately authorized administration action.
- The npm job also needs contents:write to attach assets; PyPI needs read access.
  No environment-specific variable is consumed. Repository variables are the gates.
- Manual recovery must dispatch the workflow on **the release tag ref**, not
  develop/default branch while merely passing tag as input. Environment rules
  inspect the workflow run ref, not the checkout SHA. Do not widen rules to make
  a branch-ref recovery dispatch pass.

ENABLE_NPM_PUBLISHING is already true. ENABLE_V040_RELEASE is absent. npm checks
both variables equal literal 'true'; PyPI checks ENABLE_V040_RELEASE. Policy
approval checks block both paths even after flags. Platform and main publication
share the protected npm job; no separate unprotected platform publisher exists.
Do not enable any flag now. Only after external evidence, completed notices,
reviewed true policy approvals, fresh exact-commit CI/artifact audit and separate
publication authorization should the maintainer enable ENABLE_V040_RELEASE.
Keep ENABLE_NPM_PUBLISHING explicit; do not toggle it as part of this audit.

## Non-publishing recovery tests

release-npm.test.mjs covers none, Linux-only, Linux+Windows and all-three matching
versions: verified existing packages are skipped, remaining packages written in
platform-first order. Main without platforms, wrong version/integrity or missing
provenance stops before any mutation. Registry visibility failure stops before
main. These are mocks, not proof of current account permissions or registry timing.

check-pypi-existing.py has a pure read-only comparison tested by test_release_tools:
absent version proceeds; complete matching wheel/sdist skips; partial set, differing
hash or version stops. Neither registry guard depends on whether the other registry
has published. PyPI-only and npm-only recovery therefore follow the same checks:
verify/skip the completed registry, independently publish the absent one only
after all protected approvals. Cross-registry publication is not atomic.

## Classification

| Item | Classification | Remaining exact action |
| --- | --- | --- |
| PyInstaller bootloader/loader licensing distinction | RESOLVED IN REPOSITORY | No blanket GPL bundle/source disclosure; complete separate hook notice with remaining bundle. |
| CPython/native notice material and incorporated-code coverage | STILL UNRESOLVED | Complete exact-source/distributor review and full applicable notice texts; do not approve draft. |
| Microsoft copied runtime entitlement | STILL UNRESOLVED | Maintainer/legal/vendor confirm licenses/acquisition route and permitted files, or separately design/revalidate removal. |
| npm scope, bootstrap, per-package OIDC and PyPI OIDC | REQUIRES MAINTAINER ACTION | Follow account checklist and confirm exact identities; no registry mutation authorized here. |
| npm/pypi human-approved release-only controls | REQUIRES MAINTAINER ACTION | Configure/tag-restrict/reviewer-protect both environments and confirm effective settings. |
| Recovery test coverage and disabled coordinated release gate | RESOLVED IN REPOSITORY | Keep opt-in unset until a later authorized publication. |

No application semantics, supported targets, artifact allowlists or notice files
are changed by this audit. Fresh exact-commit validation must still follow these
repository changes; entry hashes above are historical once HEAD advances.
