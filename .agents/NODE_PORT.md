# Native Node port: behavioral contract and plan

> Historical v0.3.1 reference notes. In v0.4.0 Phase 2, `node/` is private and
> retained for differential tests; `node/npm/` distributes the thin launcher and
> canonical Python executables. npm no longer owns dotenv semantics in that new
> distribution. TypeScript retirement is deferred to Phase 3; Composer is future
> work. See `NPM_EXECUTABLE.md` for actual validation status.

## Scope and reference

Python v0.2.0 was the initial reference, not a generic dotenv library.
The native Node CLI shipped in synchronized v0.3.0 on GitHub, PyPI and npm and
was merged into `develop`. Python production behavior and package layout remain
unchanged; v0.3.1 is a documentation-only patch. Keep
`src/align_dotenv/`, `tests/`, and `pyproject.toml` in place. The `node/`
workspace now implements parser/reconciliation, single-file alignment and project
discovery/preflight/application and CLI. Runtime dependencies remain absent;
future releases use protected GitHub Release-driven dual Trusted Publishing.

Audit basis: all seven Python package files and all three original test modules
were read. `fixtures/README.md` defines the shared JSON format;
`tests/test_fixtures.py` consumes it through pure reconciliation and the real CLI.
Existing focused tests remain the filesystem/project safety reference.

## Current progress

- `node/src/parser.ts` and `node/src/reconcile.ts` implement the pure core with
  camelCase functions/result metadata; custom errors retain `.lines`/`.keys`.
  Assignment/result fields and copied error metadata are readonly; assignments
  and reconciliation results are frozen. Duplicate keys use insertion-ordered Map.
- Node 22 is the tested minimum; CI covers Node 22 and 24 on Ubuntu/Windows.
  TypeScript and `@types/node` are direct dev dependencies; runtime dependencies
  are absent. The npm bin maps `align-dotenv` to `./dist/bin.js`.
- `node/test/fixtures.test.mjs` consumes the same canonical JSON as Python: all
  26 success cases and 8 string-level invalid cases, with every listed policy,
  exact messages, metadata, UTF-8 output bytes and second-pass checks.
- `node/src/files.ts` adds asynchronous single-file alignment only, using the
  existing reconciler. `node/test/file-fixtures.test.mjs` exercises all 36 shared
  cases through real files, including both formerly deferred invalid UTF-8 inputs,
  all policies, check/write paths, exact bytes and second-pass behavior.
- Focused tests cover Python whitespace, dot/end-anchor quirks, parser interfaces,
  duplicate Map ordering, readonly metadata and invalid policy precedence.
  Test failures do not dump raw payloads. Filesystem tests add real links,
  no-op identity checks, permissions, ordered replacement and injected failures.
- `node/src/project.ts` implements recursive discovery, frozen plans, full
  preflight and sequential application using `internal/file-operations.ts`.
  Shared project tests consume all 36 canonical cases, including late UTF-8
  failures; focused temporary-tree tests cover orchestration and application.
- `node/src/cli.ts` adds testable async main and `bin.ts` the compiled local entry.
  CLI tests cover exact summaries, 0/1/2 codes,
  safe errors, checks, cwd, spaces, and both modes through subprocess argument arrays.
- Node CI is configured for Ubuntu and Windows with Node 22 and 24. Existing Python CI
  and production sources are unchanged. Locally validated only in WSL/Linux:
  378 Node tests pass (263 previous tests, 107 process CLI tests and 8 direct
  API/build tests), plus 9 packed-package tests and all 47 Python tests.
  Real Ubuntu/Windows CI passed on commit `926d7aef877db7222ba728c9a50f04641e38777b`:
  [run 37423326194](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37423326194).
  Ubuntu/22, Ubuntu/24, Windows/22 and Windows/24 workspace and packed gates passed;
  Python 3.10–3.14 and Python packaging passed. No CI failures or fixes were needed.
  Windows passed 375 workspace tests with only 3 POSIX mode skips; all 9 packed
  tests passed without skips, including actual npm-generated `.cmd`/npx invocation.
  Ubuntu passed all 378 workspace and 9 packed tests without skips.
- See `node/README.md` for end-user CLI documentation. npm 0.3.0 is published;
  manual first-publication bootstrap is complete, and maintainer-configured
  Trusted Publishing is enabled for future unpublished versions. macOS is
  outside the tested release matrix, not blocked by metadata.

## Single-file implementation and platform gates

Public entry point: `alignFile(target: string, template: string,
options?: AlignFileOptions): Promise<boolean>`, with optional `unknown` and `check`.
It returns false for an exact no-op, true for check-mode changes without writing,
and true after replacement. `FileValidationError` represents path/identity state;
`Utf8DecodingError` and `FileIOError` distinguish decoding and I/O failures without
retaining raw OS messages, path properties, bytes or exception causes. Shared
helpers live in `node/src/internal/file-operations.ts`, are not exported by the
public `files.ts`/`project.ts` modules, and are not a packaged API. Tests mock the
built-in promises object/temporary handles,
not a new public dependency-injection API.

- **Reading:** templates use byte reads (template symlinks remain permitted);
  targets use read-only handles, `O_NOFOLLOW` where available, lstat checks before
  reading data and descriptor regular-file checks. Handles close on failure.
  `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` rejects malformed bytes
  and retains BOMs. No newline translation occurs in reads or UTF-8 writes.
- **Identity:** bigint `lstat(target)` / `stat(template)` identities compare
  `dev` and `ino`, including hard links and a template symlink to the target.
  Node/libuv maps Windows identities to volume serial number and file index;
  these are filesystem identities, not pathname strings. Zero inode values fail
  closed (`cannot determine file identity safely`) rather than using a weaker
  string/realpath fallback. Correctness still requires reliable metadata from the
  filesystem; Node does not expose every Windows filesystem's full identity model.
- **Replacement:** generate a 128-bit random temporary name in the target's
  directory, open exclusively (`wx`, initial mode 0600), write fully, close, apply
  the captured `mode & 0o7777`, recheck target type with lstat, and call native
  `fs.rename` once. Retry temporary-name collisions only, without cleaning a
  foreign collision file. Finally unlink only the temporary path we created;
  missing temporary after successful rename is normal. There is no delete-target,
  copy-over-target, truncate-target or Windows-specific destructive fallback.
- **Atomicity:** POSIX same-filesystem rename is the expected atomic replacement
  primitive. Node's Windows libuv implementation uses
  `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`, not a universal portable
  transactional replace guarantee. Sharing locks, read-only attributes, antivirus,
  network filesystems and other OS constraints can reject it; report a safe error,
  try temporary cleanup, and do not intentionally remove the original. No fsync,
  durability, ownership/ACL preservation or directory-fsync guarantees are added.
  Cleanup itself can fail under permissions/storage errors or process termination.
- **Modes:** POSIX passes the reference's full S_IMODE mask; tests assert 0600
  and 0640. Extended bits remain platform/filesystem-dependent in Node. Windows
  chmod represents writability, not POSIX user/group/other permissions or ACLs;
  those two POSIX assertions are skipped **only on Windows**, with an explicit
  reason. Actual replacement, links, cleanup and shared fixtures are not skipped
  by OS. Common tests still check mode application before rename on every runner.

Intentional safety/diagnostic differences from Python single-file mode:

- lstat rejects every target symlink immediately. A dangling or directory-target
  symlink gets `target must not be a symbolic link`, whereas Python's earlier
  `is_file()` check produces the regular-file diagnostic. The accepted file set
  is unchanged; this avoids following the link solely for diagnostics.
- Async update paths add observed target-type checks before reading/mode capture
  and immediately before rename. A newly observed link, directory or missing
  target is refused; these are single-file guards, not project preflight. Valid
  replacement-file identities/content are not revalidated; check/rename still has
  a TOCTOU window, as do ancestor directory changes. Windows lacks universal
  O_NOFOLLOW semantics. These guards do **not** promise race-proof reads/updates.
- Raw I/O and decoding exceptions become safe domain errors here rather than in
  a CLI. Unusual stat errors other than missing/not-a-directory are safe I/O errors;
  Python Path error suppression can differ between supported Python versions.

Sources reviewed (documentation/source analysis is not OS validation):
[Node 24 filesystem API](https://nodejs.org/docs/latest-v24.x/api/fs.html),
including bigint stats, exclusive opens, rename and Windows chmod caveats;
[Node 24.21.0's libuv Windows fs implementation](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/win/fs.c),
including stat identity mapping and native rename. The Ubuntu/Windows Actions matrix
is the authoritative release gate; macOS is untested/out of scope. Review results before
claiming cross-platform filesystem parity.

## Project implementation and validated gates

`node/src/project.ts` exports `ProjectValidationError`, readonly `DotenvPair`,
`PlannedUpdate`, `ProjectPlan`, `PlanProjectOptions`, and asynchronous `discover`,
`planProject(root, { unknown? })`, `applyProject(plan)`. Returned objects and arrays
are frozen. Updates store target path, staged content and a numeric S_IMODE mask;
they intentionally contain values **in memory**, not in diagnostics. Discovery,
ordering and pairing helpers are private.

- Discovery enumerates/sorts names, classifies directory symlinks without
  traversing them, excludes all five reference directory names at every depth,
  and recognizes only case-sensitive `.example`/`.template` suffixes with an
  `.env`-prefixed stem (including `.environment`, as Python does). Ordinary files
  and non-excluded directories are candidates. Template-looking directories,
  including directory symlinks, are **candidates but never traversal roots**;
  planning rejects them as invalid templates, even with no local target.
  A root that itself is a directory symlink is traversed, matching `os.walk`.
- Names compare by Unicode code point. Final paths compare by components like
  pathlib, with Windows case-folded components/identity keys. Ambiguous mappings
  fail after discovery and before file reads, even if the target is absent.
  Discovered-template-as-target protection runs per pair before template/target
  validation; a previously staged update still has not been applied.
- Planning lstat-validates templates (no project template symlinks), skips only
  absent targets, validates existing target type and common bigint file identity,
  reads through common strict UTF-8 helpers, reconciles and captures mode. It
  stages only changed content and performs **no filesystem writes**. All existing
  pairs remain in `pairs`; missing ones contribute only to `skipped`. An unreadable
  or invalid-UTF-8 template of a missing target is not read, matching Python.
- Application uses only `updates` and the staged bytes/modes, without rereading
  templates or reconciling. It rejects a missing, directory or symlink target
  immediately before invoking the same atomic writer used by `alignFile`.
  The writer also rechecks type before rename. Unchanged pairs are not revalidated.
  Sequential application is **not a transaction**: failure on a later update may
  leave earlier targets updated; no rollback or cross-file snapshot is added.
- Known preflight failures carry the relative target label and `no files were
  changed`. Python's project function wraps validation/syntax/unknown-key errors
  only; its CLI separately translates raw decoding/I/O errors. Node also wraps
  safe UTF-8/I/O domain errors during per-pair planning, with optional value-free
  `failureKind` metadata allowing the CLI to normalize these messages. Raw
  causes are not retained. Discovery I/O errors remain sanitized `FileIOError`
  without a per-target label. Invalid JS policy arguments retain safe `RangeError`
  behavior (and are not evaluated for zero-pair/skipped-only plans).

Linux-only differential discovery validation matched Python on 150 generated
trees (seed `20261006`), including exclusions, template-looking directories,
directory symlinks, Unicode/component ordering and ambiguity. Shared fixtures
continue to pin content rather than duplicating it in project tests.

The real cross-platform gate is **passed** for Ubuntu and Windows in run 37423326194.
The current two-OS matrix
runs the new `*.test.mjs` suites automatically. New project symlink-specific tests
skip only if Windows actually denies/does not support fixture creation; they give
an explicit privilege/capability reason. Existing filesystem tests remain intact.
The additional POSIX project permission test skips only on Windows. Linux local
success does not close any Actions gate. Existing rename/mode/identity/race caveats
above still apply, including no identity/content recheck of a valid replacement
target. String path APIs do not guarantee parity for undecodable POSIX filename
bytes; Python can represent such names via surrogate escaping. Enumeration/stat
permission failures are safe Node I/O errors, rather than mimicking every Python
version's suppression of `is_dir`/`is_file` errors.

## Observable contract

### Parser and reconciliation

- Split physical lines on LF only, retaining endings. Do not use universal newline
  conversion or split on Unicode line separators. Empty text has no lines.
- Keys are ASCII `[A-Za-z_][A-Za-z0-9_]*`; supported forms are `KEY=...`,
  `export KEY=...`, `# KEY=...`, and `# export KEY=...`. Matching permits whitespace
  in the head. Prefixes are case-sensitive. Values are raw, not evaluated,
  interpolated, trimmed, unescaped or stripped of inline comments.
- Final local occurrence wins, including value, active/commented state and raw
  line. Duplicate template assignments all remain and receive that final value.
- Template order, comments, blank lines, defaults for absent keys, assignment head
  (including `export`), and each known line's ending are authoritative. Local
  ordinary comments/blank lines disappear. Unrecognized template lines stay raw.
- State transitions use the current exact rules: to comment, prepend `# ` to the
  template head after removing leading whitespace; to activate, remove the first
  `#` and at most one following whitespace character, retaining indentation.
- `keep` appends only final unknown assignment lines, in first-seen key order,
  retaining their original representation. `remove` drops them. `error` refuses
  with sorted key names only. Result `unknown_keys` is sorted even under `remove`.
- When appending unknowns, add LF if the last template line lacks LF/CR, then an
  LF blank separator if that line is nonblank. Do not normalize unknown endings.
  Thus a CRLF template can acquire an LF separator, and unknown lines determine
  the overall final newline. Without unknowns, the template final newline wins.
- Validate every local physical line *before* applying any unknown-key policy.
  Meaningful unrecognized local lines fail; blank lines and ordinary comments
  pass. A value starting with a quote after stripping spaces/tabs must contain an
  unescaped closing quote (backslash escapes the next character). Trailing text
  after the first closing quote is allowed. Both active/commented quotes are
  validated. Active values ending in an odd count of backslashes fail; commented
  assignments, even counts, or backslashes followed by spaces pass.
- Syntax errors contain 1-based offending line numbers, never source text;
  unknown errors contain names, never values. Invalid API policies raise a
  value error before parsing; CLI choices reject them during argument parsing.

### Filesystem

- Strict UTF-8 reads, with no newline conversion or BOM stripping. Invalid UTF-8
  in either file fails, including under `--check`.
- Single-file validation order: target regular-file check, target symlink check,
  template regular-file check, same-file check. A regular-file template symlink
  is currently allowed here; project mode rejects template symlinks.
- Target/template identity includes hard links, not merely equal paths. Target
  symlinks (including dangling links) must never be followed for writes.
- Compare exact decoded contents; unchanged targets are not rewritten. Check mode
  reads/reconciles but does not write. Preserve mode bits using `stat.S_IMODE`.
- Replacement: create a temporary file in the target directory, write UTF-8 with
  exact endings, close, chmod, then atomic replace. Always clean temporary files;
  failure before replacement leaves the original untouched. There is no fsync,
  ownership/ACL preservation guarantee, or cross-file transaction.

### Project discovery and preflight

- Root is CLI cwd. Recursively map names starting with `.env` and ending with
  `.example`/`.template` by removing that final suffix (not just `.env` itself).
  Sort target paths deterministically. Exclude `.git`, `node_modules`, `.venv`,
  `venv`, `__pycache__` at every depth and do not traverse directory symlinks.
- Template-shaped directories are candidates so validation rejects them, not
  silently ignores them; do not descend into them. Traversal errors fail.
- Detect ambiguous mappings before checking target existence. A discovered
  template cannot also be another pair's target. Validate templates even when
  targets are missing; skip only genuinely absent targets (`lexists`, so a
  dangling target symlink is invalid, not skipped).
- Validate/read/reconcile every existing pair and capture modes in memory before
  any writes. A later invalid pair must prevent earlier writes, including for
  UTF-8 failures, unsafe paths, unsupported syntax and unknown-error policy.
- Apply changed targets individually, rechecking symlink/regular-file status.
  Preflight errors write nothing; failures during apply may leave earlier targets
  updated. Pair count counts existing targets; skipped count is separate.

### CLI and diagnostic contract (implemented privately)

- Positional target and `--template` must appear together; neither means project
  mode. `--unknown` defaults to `keep`. `--check` never writes. Exit codes: 0 for
  success/aligned, 1 for check-mode changes, 2 for invalid/unsafe input or I/O.
- Single-file stdout (one LF-terminated line): write = `Updated target.` or
  `Target already aligned.`; check = `Target is not aligned.` or
  `Target is aligned.`. Successful stderr is empty; failures have empty stdout.
  Message endings here are logical LF; Python standard streams translate them
  to platform newlines (CRLF on Windows), unlike the raw dotenv file I/O layer.
- Project write changes: `Aligned N dotenv file(s).`; check changes:
  `1 dotenv file needs alignment.` / `N dotenv files need alignment.`. No changes:
  `1 dotenv file is aligned.` / `All N dotenv files are aligned.` (including 0).
  If skipped, append `Skipped 1 template because its target does not exist.` or
  `Skipped N templates because their targets do not exist.`. Each line ends LF.
- Operational errors: `align-dotenv: <safe message>\n`, never a traceback or
  exception's raw I/O text. Unicode errors: `files must contain UTF-8 text.`;
  OSError: `cannot read or update files; check paths and permissions.`. Project
  validation adds relative target paths and sometimes `no files were changed`.
  No dotenv values may appear in output, errors, debug logs or test diagnostics.
- Python argument errors/help are argparse-generated. Node uses a small internal
  dependency-free scanner with concise static help and redacted argument errors;
  usage wrapping/formatting is deliberately not byte-identical. Only the supported
  surface is promised, not every argparse edge case: clustered short help flags,
  and help alongside preceding unknown/extra arguments, can differ in precedence.
  Long unambiguous abbreviations, equals values, repeated options (last wins),
  negative numeric paths and `--` are supported. Invalid tokens are never echoed.
- `main(argv = process.argv.slice(2), context = {})` returns a Promise of exit code.
  Context supplies optional cwd/stdout/stderr only; default process cwd is read
  after argument parsing/help. Explicit paths resolve against that cwd. No lower
  layer logic is duplicated. Entry `bin.ts` retains `#!/usr/bin/env node` and sets
  `process.exitCode`; local use is `node /absolute/path/to/node/dist/bin.js ...`.
  Workspace subprocess tests remain intact; packed tests now validate npm's
  generated bin/shim outside the repository.
- File/project validation, syntax and unknown-key errors preserve safe text.
  UTF-8/I/O domain errors normalize to Python's messages, including wrapped
  project errors via `failureKind` (no raw cause/message parsing). Unforeseen
  internal errors get a generic value-free failure, not a stack trace. Existing
  target-symlink diagnostic differences remain as documented above.
- 107 process-level tests plus 8 direct API/build tests cover shared inputs,
  exact grammar, arguments, help, paths with spaces, no-write checks, late failures,
  safe error normalization and entry shebang. Tests normalize output CRLF for
  logical comparisons; a separate assertion checks platform-native newlines.
  One-off WSL/Linux differential validation passed 182 Python/Node CLI scenarios,
  comparing exit codes, final bytes and stable stdout/stderr. Argument diagnostics
  compare exit semantics only; help layout is not a byte-parity requirement.

## Deliberate Node hazards

- **UTF-8:** `Buffer.toString("utf8")` silently replaces malformed input. Use
  fatal decoding, e.g. `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`.
  Here `ignoreBOM: true` means retain the BOM character, matching Python. Test
  invalid byte sequences and BOM behavior at both file boundaries.
- **Regex/string semantics:** JS `\s`, `trim` and `trimStart` are not exact Python
  equivalents (e.g. U+0085, U+FEFF); Python's comment check strips only spaces/tabs.
  JS dot also differs on CR/U+2028/U+2029. Translate deliberately rather than
  copying regexes. Use insertion-ordered `Map`, not a prototype-bearing object:
  `__proto__` and `constructor` are valid dotenv keys. Use non-locale sorting;
  JS UTF-16 ordering can differ from Python code-point sorting for Unicode paths.
- **Same file:** use stat identity (`dev` + `ino`, preferably bigint where needed)
  to preserve `Path.samefile()` hard-link detection where supported, with explicit
  platform tests, not string/realpath comparison alone.
- **Symlinks:** use lstat-style checks at validation/revalidation boundaries;
  preserve the deliberate single/project template distinction and dangling-link
  behavior. Do not accidentally follow targets while deciding whether to skip.
- **Atomic replacement:** same-directory temporary files, close before replace,
  mode preservation, cleanup on all failures. Explicitly test Windows rename,
  open handles, permissions and inode availability; do not fall back to truncating
  the target. Atomic replacement is not durable fsync or project-wide rollback.
- **Preflight/CLI:** no lazy reconciliation during writes; keep parsing, pure
  reconciliation, I/O, orchestration and value-free diagnostics separate.

## Ambiguities / limitations (unchanged)

Templates are not syntax-validated. An unsupported or unclosed default can be
written on the first pass and rejected as local content on the second. The shared
`unvalidated-template-default-known-limitation` case pins this explicitly rather
than claiming universal idempotency. Resolve any stricter template contract in a
separate behavior change, not silently in the port.

Bare CR is not a physical line separator, but the assignment-ending regex accepts
a terminal CR and unknown separator logic treats it as an ending. Preserve this
quirk initially. Quote/continuation validation is intentionally a narrow heuristic,
not shell syntax validation (including escapes inside single quotes).

The pure port reproduces Python's `\s`/`str.isspace()` with an explicit character
set, uses `[^\n]` for Python dot, and a strict end lookahead for Python `$` (which
also accepts the position before a final LF). Direct parser calls can therefore
recognize an assignment with two trailing LFs, although normal physical-line
splitting prevents this during reconciliation. The invalid-policy Python
`ValueError` maps to JavaScript `RangeError`; its safe message and precedence are
unchanged. No new parsing or reconciliation semantics are introduced.

Path checks have TOCTOU windows: apply rechecks file type, not identity/content or
template identity. Concurrent modification and apply-time rollback are not
guaranteed. Documented safety should not be expanded into claims of race-proof
validation or transactional project writes. New hardening requires separate tests
and a deliberate contract decision.

## Implementation order and gates

| Python | TypeScript |
| --- | --- |
| `parser.py` | `parser.ts` |
| `reconcile.py` | `reconcile.ts` |
| `files.py` | `files.ts` |
| `project.py` | `project.ts` |
| `cli.py` | `cli.ts` |

1. **Parser (implemented):** raw physical-line and assignment model; reference
   whitespace, endings, state and safe syntax errors, with focused unit tests.
2. **Reconciliation (implemented):** pure functions consuming shared fixtures;
   exact output, metadata, error precedence and second-pass behavior.
3. **Filesystem layer (implemented; Ubuntu/Windows CI passed):** strict
   UTF-8 bytes/text boundary, regular-file validation, same-file identity,
   symlink rejection, mode bits, atomic replacement,
   cleanup and unchanged-file tests. Both byte-input fixtures are now exercised.
4. **Project discovery/preflight (implemented; Ubuntu/Windows CI passed):** recursive discovery, exclusions,
   directory symlinks, ambiguity, missing targets, full in-memory preflight,
   planned updates, post-preflight target safety and per-file atomic application.
   Existing Python scenarios reproduced, including late failures without earlier writes.
5. **CLI (released; Ubuntu/Windows CI passed):** argument parsing, explicit target/template and
   project modes, `--unknown`, `--check`, safe diagnostics, stdout grammar and
   exit codes 0/1/2. Exact output and no-value-leak tests included.
6. **Package readiness (implemented; Ubuntu/Windows CI passed):** production
   metadata, tested Node 22 baseline, restricted real tarball inspection, MIT
   license, fresh offline install and generated-bin tests. Preserve tag/version
   guards and protected-environment release approval; see the release strategy below.
7. **Cross-runtime/differential tests:** run the same fixtures in both runtimes,
   compare exact bytes and structured errors; add generated fake-input cases.
   Shared fixture parity is a gate from step 1, not deferred until this step.
8. **Cross-platform CI:** Ubuntu/Windows coverage, especially links, atomic
   replacement and permissions; platform-limited assertions must be explicit.

The Node functionality is implemented for the current Python contract, with
documented parser/filesystem/argument differences and validated Ubuntu/Windows
gates. No additional user-facing functionality is part of release preparation.

## Published npm artifact contract

- Package root remains `node/`. Metadata uses `align-dotenv`, synchronized Python/
  npm version metadata, MIT, Geonhui Lee, GitHub URLs with
  repository directory `node`, CLI keywords, ESM, `engines.node >=22`, and the bin
  mapping above. No `os` restriction or runtime dependencies. `private: false`
  permits publication, guarded by explicit release event/version/environment checks.
- Node 22 was chosen as the oldest current supported LTS line, not because of a
  Node 24-only API. ES2022/top-level-await ESM, fatal TextDecoder with BOM options,
  bigint stat/lstat, file handles/exclusive opens/chmod/rename, crypto randomBytes,
  process spawning and string helpers all work on Node 22.0.0. Build, all 378
  source tests and 9 packed tests were locally run on that exact version with
  npm 10 (newer npm 11 itself requires a newer Node patch). Also validate Node 24
  and development Node 26. CI covers 22/24 for both required OSes; 20 is EOL and
  unsupported. Typings remain 24.x; minimum-runtime tests guard actual usage.
- `files` includes compiled JS and declarations plus LICENSE; npm automatically
  includes README/package.json. The real tar payload has **17 files**: seven JS,
  seven declarations (including internal runtime helpers), README, LICENSE,
  package.json. No sources/tests/fixtures/lockfile/node_modules/maps/env files
  or repository plans. The package-local LICENSE is byte-identical to root MIT.
  `prepack` builds, but no prepare/install script or compiler runs in consumers.
- `npm run test:package` builds, packs to an owned temporary outside the checkout,
  parses the gzip/tar bytes, verifies exact allowlist against npm's JSON report,
  checks metadata/version/license/shebang, scans for known fake values, credentials
  and local paths, and verifies relative runtime imports resolve within the tar.
  No inspection can prove the absence of every unknown secret; the tiny exact
  allowlist and inspected contents provide the relevant package boundary.
- Fresh offline installation disables lifecycle scripts and installs only this
  zero-dependency tarball. Tests check installed independence/bin presence and
  POSIX execute bits or Windows `.cmd` shim contents. Actual invocation uses
  consumer npm scripts and offline npm exec (npx equivalent), **not** repository
  dist/bin.js. Node invokes npm's JS CLI with argument arrays so Windows `.cmd`
  spawning does not depend on Bash; npm handles its native generated shim.
  Test help, explicit/check/aligned, all policies, safe syntax/UTF-8 failures,
  consumer-cwd project recursion/skips, late preflight no-writes and all 26 shared
  successful fixture bytes. Nine automated tests pass locally under Linux.
- Required release gate is now Ubuntu/Windows only, per scope decision. macOS is
  neither validated nor claimed supported and is not artificially excluded from
  installation. Both workspace and packed Actions results passed for Node 22/24
  on both OSes. Windows shim proof comes from Actions, never local WSL emulation.
- npm 0.3.0 is publicly published; its 17 payload files were verified byte-for-byte
  against the release checkout, with fresh public npm install/shim smoke validation.

## Released v0.3.0 and current dual-release procedure

- [GitHub v0.3.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.3.0),
  [PyPI 0.3.0](https://pypi.org/project/align-dotenv/0.3.0/), and
  [npm 0.3.0](https://www.npmjs.com/package/align-dotenv/v/0.3.0) are published.
  Immutable source/tag target: `18678bb3dda22ab8b60762e0c0ecc3d8382b5c5c`.
- Historical bootstrap: npm 0.3.0 was published manually with maintainer account
  authentication + 2FA; npm automation was skipped for that release. PyPI used
  [Trusted Publishing](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37428603117).
  Fresh public installs and matching release-source contents were verified.
  Never replay that version's npm publication or move its tag.
- PR #1 merged via merge commit `6a6b0afa3b2fb2fc62142381a65aa982e97adf4b`,
  preserving release ancestry. [Post-merge CI](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37430410781)
  passed all required Ubuntu/Windows, Python and packaging jobs.
- Future releases use a single explicit GitHub Release and synchronized versions.
  `scripts/check-versions.mjs` checks Python [project], npm manifest and lockfile
  identity/version; 9 guard tests run in CI. Release mode additionally requires
  `RELEASE_TAG == vX.Y.Z`, and both publishers enforce it before upload.
- npm Trusted Publisher is maintainer-configured as
  `Geonhui-Lee / align-dotenv / publish-npm.yml / npm`; the protected GitHub npm
  environment and repository variable `ENABLE_NPM_PUBLISHING=true` are configured.
  The agent does not change account settings or introduce tokens.
- npm release-only validation reruns Ubuntu/Windows x Node 22/24 from the tag.
  The Node 24 publisher requires `private: false`, npm >=11.5.1 and tag/version
  agreement; builds/tests/packs then runs `npm publish --provenance --access public`
  with `contents: read`, `id-token: write` and the npm environment. No manual
  uploads or long-lived tokens. Protected-environment approvals must not be bypassed.
- PyPI retains its release event, tag/version checks, build/twine checks, protected
  pypi environment and Trusted Publisher. Neither publisher runs on ordinary pushes.
- [Official npm guidance](https://docs.npmjs.com/trusted-publishers/) requires npm
  >=11.5.1 and Node >=22.14.0 for OIDC, independent of the Node >=22 runtime floor.
  Direct publish permission must match the workflow, not stage-only permission.
  Public repository/package OIDC publishing supports automatic provenance.
- Validate the exact commit, tag once, observe both workflow results, verify both
  registries, npm latest/provenance and fresh installs before marking a release
  complete. Cross-registry uploads are not atomic; never republish existing versions.

## v0.3.1 documentation patch

- End-user npm README removes obsolete unpublished/prepared/bootstrap language and
  explains installation, project/explicit usage, policies, exit codes, syntax,
  safety and tested platform scope. Operational details remain in maintainer docs.
- Python/npm/lockfile are synchronized for 0.3.1 after documentation validation;
  production sources and zero-runtime-dependency behavior stay unchanged.
- Required gates: 47 Python tests + compile/import, 378 workspace and 9 packed
  tests, version guards, actual tarball/installed README/bin verification, and
  Ubuntu/Windows x Node 22/24 plus Python CI. Actual results are reported from the
  pushed release commit; preparation alone is not publication success.
- Current status: preparing the first automated dual release. Follow the current
  [maintainer procedure](../CONTRIBUTING.md); do not claim publication until both
  workflow and public-registry checks succeed.
