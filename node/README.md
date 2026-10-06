# align-dotenv

> This private, dependency-free workspace validates the v0.4.0 candidate executable-backed
> npm distribution in `npm/`. The native TypeScript implementation, compiler and
> reference-only tests have been retired. Python is the sole behavioral source;
> JavaScript only launches the packaged executable. Released npm v0.3.1 is unchanged.
> See `.agents/NPM_EXECUTABLE.md` and `.agents/PHASE3.md` in the repository.
> Publication is blocked until `.agents/RELEASE_V040.md` prerequisites are resolved.

Keep local dotenv files aligned with their templates without losing local values.

`align-dotenv` uses `.env*.example` and `.env*.template` files for structure while
preserving existing local values and active/commented assignment state.

**Understand it, preserve it, or refuse to modify it.**

## Install

Requires **Node.js >=22**. The commands below install the existing published
release. The unreleased executable-backed distribution uses exact-version optional
platform packages; consumers will not require a Python installation:

```bash
npm install --save-dev align-dotenv
npx align-dotenv
npx align-dotenv --check
```

Or add project scripts:

```json
{
  "scripts": {
    "env:align": "align-dotenv",
    "env:check": "align-dotenv --check"
  }
}
```

The supported npm contract is the CLI; a stable JavaScript library API is not
currently promised. Run `npx align-dotenv --help` for all options.

## Usage

### Project mode

Run from the project root:

```bash
npx align-dotenv
```

Recursively discovers `.env*.example` and `.env*.template`, removing the final
suffix to find the corresponding local target:

```text
project/
├── .env
├── .env.example
└── apps/api/
    ├── .env.development
    └── .env.development.template
```

Missing targets are skipped and reported, not created. Ambiguous templates fail.
Discovery skips `.git`, `node_modules`, `.venv`, `venv`, `__pycache__`, and child
directory symlinks.

All existing pairs are validated and reconciled **before any project writes**.
A preflight failure prevents every update. After successful preflight, changes
are applied per file, not as a cross-file transaction or rollback.

### Explicit mode

Supply the target and template together:

```bash
npx align-dotenv .env --template .env.example
npx align-dotenv .env --template .env.example --check
```

Relative and absolute paths, including paths containing spaces, are supported.

## Unknown keys

Choose what happens to local assignments absent from the template:

- `--unknown keep` (default): append them, retaining raw values and state.
- `--unknown remove`: explicitly discard them.
- `--unknown error`: refuse changes, reporting unknown key names only.

Works in both modes:

```bash
npx align-dotenv --unknown error
npx align-dotenv .env --template .env.example --unknown keep
npx align-dotenv .env --template .env.example --unknown remove
```

## Check mode and exit codes

`--check` performs the same validation without writing:

```bash
npx align-dotenv --check
```

| Code | Meaning |
| --- | --- |
| 0 | Success or already aligned |
| 1 | `--check` found required changes |
| 2 | Invalid invocation, unsafe/unsupported input, or invalid state/I/O failure |

## Supported syntax and safety

- Single-line `KEY=value`, `export KEY=value`, `# KEY=value`, and
  `# export KEY=value`; keys match `[A-Za-z_][A-Za-z0-9_]*`.
- Values stay raw text: no evaluation, interpolation, trimming, or unquoting.
  The final local assignment wins. The template controls order, comments, layout,
  and defaults; ordinary local comments and blank lines may be omitted.
- Unsupported shell-like local syntax, line continuations, and unclosed quoted
  values are rejected. This is not a full shell or dotenv interpreter.
- Invalid UTF-8 is rejected. Diagnostics show safe metadata, not dotenv values.
- Target symlinks are rejected; targets must be regular files distinct from the
  template, including by hard-link identity. Unchanged files are not rewritten.
- Changed files use atomic per-target replacement where the filesystem supports
  it. Replacement failures are reported without a delete/truncate fallback.
  Windows permissions and file locking differ from POSIX behavior.

Known assignments follow template line endings; kept unknown assignments retain
their original representation. Templates are not syntax-validated, so unsupported
defaults may be refused as local content on a later run. Concurrent modification,
cross-file rollback, and crash durability are not guaranteed.

## Platform support

The unreleased distribution supports **Ubuntu 24.04 x86_64** and **Windows Server
2022 x86_64**, tested with **Node 22, 24 and 26**. Unsupported OS/architecture fails
safely. macOS, ARM, musl and older Linux are not claimed; bundled Python requires
GLIBC_2.38. These restrictions do not change previously published npm releases.

## Development / Repository

See the [repository](https://github.com/Geonhui-Lee/align-dotenv) for development
instructions, shared behavioral fixtures, and detailed limitations.
The [Python distribution](https://pypi.org/project/align-dotenv/) provides the same
development-time CLI through Python tooling.

Issues and contributions: [GitHub](https://github.com/Geonhui-Lee/align-dotenv/issues)
and [contributor guidance](https://github.com/Geonhui-Lee/align-dotenv/blob/develop/CONTRIBUTING.md).
