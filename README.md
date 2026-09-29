# align-dotenv

Keep your `.env` files aligned with their templates — without losing local values.

The template controls structure and known variables. Your local file controls existing
values and whether each variable is active or commented out. Unknown local variables
are kept by default. Unsupported local syntax causes a safe failure, not data loss.

## Install

Python 3.10–3.14 is supported. Once published to PyPI:

```bash
uv tool install align-dotenv
# or
pipx install align-dotenv
# or
python -m pip install align-dotenv
```

These PyPI commands require the first release to be published; until then, install
from this checkout with `python -m pip install .` or `uv tool install .`.

## Use

```bash
align-dotenv .env --template .env.example
align-dotenv .env --template .env.example --check
align-dotenv .env --template .env.example --unknown keep    # default
align-dotenv .env --template .env.example --unknown remove  # explicitly drop unknown keys
align-dotenv .env --template .env.example --unknown error   # fail, listing key names only
```

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
Changes replace the target atomically in its directory, preserve its mode bits,
and skip the write if already aligned.

## Develop

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
python -m compileall -q src tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [PLANS.md](PLANS.md).
