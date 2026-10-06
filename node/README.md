# align-dotenv

> This private workspace retains the released v0.3.1 native TypeScript behavior
> as a temporary migration reference. The unreleased executable-backed npm
> distribution is defined in `npm/`; it contains no TypeScript dotenv semantics.
> See the repository's `.agents/NPM_EXECUTABLE.md`. Native implementation removal
> is deferred to Phase 3. The installation/support notes below describe v0.3.1.

Keep local dotenv files aligned with their templates without losing local values.

`align-dotenv` uses `.env*.example` and `.env*.template` files for structure while
preserving existing local values and active/commented assignment state.

**Understand it, preserve it, or refuse to modify it.**

## Install

Requires **Node.js >=22**. Install as a development-time CLI with zero runtime
dependencies:

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

Node.js **>=22**. Release CI tests **Linux/Ubuntu** and **Windows**, with **Node 22
and Node 24**; local Linux validation also uses WSL. macOS is not currently part of
the tested release matrix, but installation is not blocked.

## Development / Repository

See the [repository](https://github.com/Geonhui-Lee/align-dotenv) for development
instructions, shared Python/Node behavioral fixtures, and detailed limitations.
The [Python distribution](https://pypi.org/project/align-dotenv/) provides the same
development-time CLI through Python tooling.

Issues and contributions: [GitHub](https://github.com/Geonhui-Lee/align-dotenv/issues)
and [contributor guidance](https://github.com/Geonhui-Lee/align-dotenv/blob/develop/CONTRIBUTING.md).
