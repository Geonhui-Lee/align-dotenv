# align-dotenv

Keep local dotenv files aligned with their templates without losing local values.

The template controls structure and known variables. Your local file controls existing
values and whether each variable is active or commented out. Unknown local variables
are kept by default. Unsupported local syntax causes a safe failure, not data loss.

## Install

> **Unreleased v0.4.0 direction:** Python is becoming the single behavioral
> implementation. Development npm packages delegate to packaged executables
> without requiring Python, initially Linux x86_64 (Ubuntu 24.04) and Windows
> x86_64 (Server 2022). macOS/ARM and older glibc/musl support are not claimed.
> Released v0.3.1 npm still uses native TypeScript. Composer is future work.
> See [migration notes](.agents/NPM_EXECUTABLE.md).

Packages: [npm](https://www.npmjs.com/package/align-dotenv) · [PyPI](https://pypi.org/project/align-dotenv/).

`align-dotenv` is available for both Python and Node.js development workflows.
Both distributions expose the same CLI behavior. The npm package is intended as a
development-time CLI; a stable JavaScript library API is not currently promised.

### Node.js / npm

Node.js 22+ is supported.

```bash
npm install --save-dev align-dotenv
```

Run it directly:

```bash
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

The Node.js release is tested on Linux/Ubuntu (including WSL) and Windows with
Node.js 22 and 24. macOS is not currently part of the tested release matrix, but
installation is not blocked.

### Python

Python 3.10–3.14 is supported.

```bash
uv tool install align-dotenv
# or
pipx install align-dotenv
# or
python -m pip install align-dotenv
```

## Use

### Explicit single-file mode

```bash
align-dotenv .env --template .env.example
align-dotenv .env --template .env.example --check
align-dotenv .env --template .env.example --unknown keep    # default
align-dotenv .env --template .env.example --unknown remove  # explicitly drop unknown keys
align-dotenv .env --template .env.example --unknown error   # fail, listing key names only
```

### Project mode

Run without a target or template from the project root:

```bash
align-dotenv
align-dotenv --check
align-dotenv --unknown keep    # default
align-dotenv --unknown remove
align-dotenv --unknown error
```

Project mode recursively discovers `.env*.example` and `.env*.template` files and
removes the suffix to find the corresponding local target. For example:

```text
project/
├── .env                    ← .env.example
├── .env.example
└── apps/api/
    ├── .env.development    ← .env.development.template
    └── .env.development.template
```

Only existing targets are aligned; templates with missing targets are skipped and
reported, never used to create targets. If two templates map to the same target
(such as `.env.example` and `.env.template`), the command fails without writing.

Discovery is sorted by target path and skips `.git`, `node_modules`, `.venv`,
`venv`, and `__pycache__` directories, as well as directory symlinks.

Project mode validates and reconciles every pair in memory **before writing any
target**. An invalid pair or `--unknown error` failure prevents all writes. After a
successful preflight, changed files are replaced atomically one at a time; this is
not a cross-file transaction. Unchanged files are not rewritten.

`--check` performs the same full preflight without writing:

- exit `0`: everything is aligned
- exit `1`: at least one target needs alignment
- exit `2`: invalid invocation, input, or project state

### Reconciliation

Given `.env.example`:

```dotenv
# Required setting
REQUIRED=template

# OPTIONAL=template
```

and a local `.env`:

```dotenv
OPTIONAL='local choice'
REQUIRED=local
```

alignment produces:

```dotenv
# Required setting
REQUIRED=local

OPTIONAL='local choice'
```

The template keeps control of layout while existing local values and active/commented
state are preserved.

## Syntax and safety

**Understand it, preserve it, or refuse to modify it.**

Supported assignments are:

- `KEY=value`
- `export KEY=value`
- `# KEY=value`
- `# export KEY=value`

Keys must match `[A-Za-z_][A-Za-z0-9_]*`. Values are preserved as raw text;
`align-dotenv` is intentionally not a full shell or dotenv interpreter.

Unsupported meaningful local content, such as shell directives, line continuations,
or unclosed quoted values, stops the operation without modifying the file. Errors
report safe metadata such as line numbers or unknown key names, not dotenv values.

The existing target must be a regular file, not a symlink or the template itself.
Known lines follow the template's line endings and final newline. Unknown assignments
kept by default retain their original representation. Changes are replaced atomically
within the target directory, mode bits are preserved where meaningful, and already
aligned files are not rewritten.

## Development

Run the Python and Node.js suites from the repository root:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
python -m compileall -q src tests

npm --prefix node ci
npm --prefix node test
npm --prefix node run test:package

node scripts/check-versions.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor guidance and
[node/README.md](node/README.md) for Node.js-specific implementation and packaging
details and npm CLI usage.
