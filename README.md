# align-dotenv

Keep local dotenv files aligned with their templates without losing local values.

The template controls structure and known variables. Your local file controls existing
values and whether each variable is active or commented out. Unknown local variables
are kept by default. Unsupported local syntax causes a safe failure, not data loss.

## Install

Choose the ecosystem that fits your development tooling. Both distributions expose
the same `align-dotenv` CLI; npm is a development-time tool, not a promised public
JavaScript library API.

### Python

Python 3.10–3.14 is supported.

```bash
uv tool install align-dotenv
# or
pipx install align-dotenv
# or
python -m pip install align-dotenv
```

For development from a checkout:

```bash
python -m pip install .
# or
uv tool install .
```

### Node.js / npm (prepared for v0.3.0; not yet published)

Node 22+ is supported. Workspace and packed/fresh-consumer CLI tests pass on
Linux/Ubuntu and Windows with Node 22 and 24. WSL is used for local Linux validation.
macOS is not part of the tested Node release matrix; installation is not blocked.

After separately authorized npm publication:

```bash
npm install --save-dev align-dotenv
npx align-dotenv
npx align-dotenv --check
```

Or add development scripts:

```json
{
  "scripts": {
    "env:align": "align-dotenv",
    "env:check": "align-dotenv --check"
  }
}
```

The repository prepares synchronized Python/npm version `0.3.0`; neither
distribution's 0.3.0 release has been published. npm is prepared with `private: false`
for the maintainer's manual, interactive account + 2FA bootstrap. Automated npm
publishing remains disabled for v0.3.0. See [node/README.md](node/README.md) for
local tarball validation and Node-specific limitations. No stable JavaScript
imports are offered initially.

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

Run without a target or template from the project root (the current working directory):

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
`venv`, and `__pycache__` directories, as well as directory symlinks. Project
mode validates and reconciles every pair in memory **before writing any target**;
an invalid pair or `--unknown error` failure prevents all writes. After a
successful preflight, changed files are replaced atomically one at a time (not
as a cross-file transaction). Unchanged files are not rewritten.

`--check` performs the same full preflight without writing: exit 0 means all
existing targets are aligned, 1 means at least one needs alignment, and 2 means
an invalid project state (including ambiguous mappings or unsupported syntax).

### Reconciliation

For example, with `.env.example`:

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

`--check` never writes: exit 0 means aligned, 1 means a change is needed. Invalid
inputs, unsupported syntax, and `--unknown error` with unknown keys exit 2.

## Syntax and safety

**Understand it, preserve it, or refuse to modify it.** The supported syntax is
single-line `KEY=value`, `export KEY=value`, `# KEY=value`, and
`# export KEY=value`, with keys matching `[A-Za-z_][A-Za-z0-9_]*`. Values are
kept as raw text; this is not a full shell or dotenv parser. Unsupported meaningful
local content (such as shell directives, line continuations, or unclosed quoted
values) stops the operation without modifying the file. Errors show line numbers,
not offending lines or values. Ordinary local comments and blank lines may be
omitted because the template defines the layout. The final assignment wins if a
key appears repeatedly.

The existing target must be a regular file, not a symlink or the template itself.
Known lines use the template's line endings and final newline; unknown lines kept
by default retain their original representation, so mixed endings are possible.
Changes replace the target atomically in its directory, preserve mode bits where meaningful
(Windows does not reproduce POSIX permissions),
and skip the write if already aligned.

## Develop

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
python -m compileall -q src tests
npm --prefix node ci
npm --prefix node test
npm --prefix node run test:package
node scripts/check-versions.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor guidance.
