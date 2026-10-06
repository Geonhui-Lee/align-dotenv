# align-dotenv

Align local dotenv files with their templates while preserving existing values
and commented/active state. Zero runtime dependencies.

**Understand it, preserve it, or refuse to modify it.**

## Package status

The Node implementation is functionally complete against the Python v0.2.0
reference, with documented limitations. This npm package is **not published**;
`private: true` still prevents accidental publication. Version `0.3.0` is prepared
for the future synchronized Python/npm release; no tag or release has been created.
The supported contract is initially the development-time CLI, not stable public
JavaScript imports.

Node.js **22 or later** is required. The release test matrix is **Linux/Ubuntu
(including WSL development environments) and Windows**, on Node 22 and 24.
Workspace and packed installation/bin validation passed on both OSes in
[GitHub Actions](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37423326194).
Local validation is WSL/Linux only. macOS is not currently part of the tested release
matrix. There is no OS installation restriction in package metadata.

## Installation and usage

After npm publication is separately authorized and completed:

```bash
npm install --save-dev align-dotenv
npx align-dotenv
```

Or use a project script:

```json
{
  "scripts": {
    "env:align": "align-dotenv",
    "env:check": "align-dotenv --check"
  }
}
```

`npx align-dotenv --help` shows the supported options. During package preparation,
install the locally packed tarball instead of fetching an unpublished package.
Avoid having the Python and npm executables compete for the same command on PATH;
local npm scripts/npx select the project's installed Node binary.

### Explicit mode

```bash
npx align-dotenv .env --template .env.example
npx align-dotenv .env --template .env.example --check
npx align-dotenv .env --template .env.example --unknown keep
npx align-dotenv .env --template .env.example --unknown remove
npx align-dotenv .env --template .env.example --unknown error
```

Target and template must be supplied together. Relative/absolute paths and paths
containing spaces are supported. The default unknown-key policy is `keep`:

- `keep`: append unknown local assignments, retaining raw values and state.
- `remove`: explicitly discard assignments absent from the template.
- `error`: refuse to update, reporting unknown key names only.

### Project mode

With neither target nor template, run from the project root:

```bash
npx align-dotenv
npx align-dotenv --check
npx align-dotenv --unknown remove
```

Recursively discovers `.env`-prefixed names ending in `.example` or `.template`;
only the final suffix is removed to find the local target. Missing targets are
skipped and reported, never created. Excludes `.git`, `node_modules`, `.venv`,
`venv`, and `__pycache__`; child directory symlinks are not traversed. Ambiguous
mappings and templates that would themselves become targets are rejected.

Every existing pair is validated/reconciled **before any writes**. A later
preflight failure prevents all updates. After preflight, changed targets are
replaced individually: there is **no cross-file transaction or rollback**.

### Check and exit codes

`--check` performs the same validation but never writes.

| Code | Meaning |
| --- | --- |
| 0 | Successfully aligned, or already aligned |
| 1 | Valid `--check` found changes needed |
| 2 | Invalid invocation, unsupported/unsafe input, or I/O failure |

Explicit output is `Updated target.` / `Target already aligned.`, or
`Target is not aligned.` / `Target is aligned.` in check mode. Project output
counts changed/aligned files and reports skipped templates. Operational errors
use `align-dotenv: <safe message>` on stderr, without values or stack traces.

## Supported syntax and safety

- Single-line `KEY=value`, `export KEY=value`, `# KEY=value`, and
  `# export KEY=value`; keys match `[A-Za-z_][A-Za-z0-9_]*`.
- Values remain raw text: no evaluation, interpolation, trimming or unquoting.
  Final local assignment wins. Template order, comments, layout and defaults
  supply the output; ordinary local comments/blank lines can be omitted.
- Unsupported meaningful local syntax, line continuations and unclosed quoted
  values are refused. This is not a complete shell/dotenv interpreter.
- Strict UTF-8 reads retain BOMs and raw newline representation. Known lines use
  template endings; kept unknown lines retain theirs, so mixed endings are possible.
- Targets must be non-symlink regular files, distinct from templates by filesystem
  identity, including hard links. Explicit mode permits regular template symlinks;
  project mode rejects them. Already-aligned files are not rewritten.
- Changes use exclusive, random same-directory temporaries and native replacement,
  with cleanup and POSIX mode preservation. Never delete/truncate the original as
  a replacement fallback. Windows permissions are not POSIX permissions/ACLs;
  locks, attributes and filesystem constraints can reject native replacement.

Templates are intentionally not syntax-validated: an unsupported default can be
written on one pass, then refused as local content on the next. File-type rechecks
do not eliminate TOCTOU races or compare post-preflight content/identity. There is
no fsync/durability or ownership/ACL guarantee. Undecodable POSIX filename bytes
are outside guaranteed Node string-path parity. Help/argument-error formatting is
not byte-identical to argparse; some uncommon help/error precedence differs.

## Development and package validation

From the repository root:

```bash
npm --prefix node ci
npm --prefix node run build
npm --prefix node test
npm --prefix node run test:package
node scripts/check-versions.mjs
```

`test:package` builds, runs real `npm pack --json`, inspects the gzip/tar payload,
installs it offline into a fresh external consumer, and invokes npm's generated
CLI shim through npm scripts and npm exec (npx equivalent). Both Ubuntu and
Windows CI run workspace and packed-package suites. No Python or TypeScript source
is needed by the installed package. Source tests consume the canonical repository
fixtures; those fixtures are not shipped.

The tarball contains `dist/` JavaScript/declarations, this README, the MIT LICENSE
and package.json only. Internal runtime helpers must ship with dist, but are not
a promised public library API. No sources, tests, fixtures, dependencies,
sourcemaps or planning files are included. `prepack` rebuilds; consumers never
need the compiler. TypeScript and Node typings are development-only dependencies.

Publication is not enabled here. Remaining authorization/account-side steps are
documented in repository `CONTRIBUTING.md`: package/name ownership, trusted publisher
and protected npm environment setup, explicit `private: false`, and the opt-in
`ENABLE_NPM_PUBLISHING=true` repository variable. None of those settings was changed.
The release-only workflow rechecks tag/version and both OSes before any future upload.
