# align-dotenv

Align a local dotenv file with a template while keeping its existing values.

```bash
align-dotenv .env --template .env.example
```

**The template controls structure. The local file controls existing values. Unknown
local variables are preserved unless you explicitly choose otherwise.**

The target must already exist and cannot be the template. The template determines key
order, comments, blank lines, assignment prefixes, line endings and final newline for
template-derived lines. Existing local keys retain their raw value text and their
active/commented state. New keys use template values. Unknown local assignments are
appended in their original line representation with `--unknown keep` (the default),
so mixed line endings are possible. A second run makes no further changes.

```bash
align-dotenv .env --template .env.example --unknown remove  # explicitly drop unknown keys
align-dotenv .env --template .env.example --unknown error   # refuse; list key names only
align-dotenv .env --template .env.example --check           # no write; 0=aligned, 1=different
```

Invalid input, unknown keys under `error`, and file errors exit with status 2. The CLI
never displays values; `--check` reports alignment without showing a diff. File updates
use a temporary file in the target directory and atomic replacement, preserving mode
bits on successful writes. An unchanged target is not replaced. This requires write
access to the target directory; symbolic-link targets are rejected.

The parser supports single-line `KEY=value`, `export KEY=value`, `# KEY=value`, and
`# export KEY=value` assignments with names matching `[A-Za-z_][A-Za-z0-9_]*`.
It is not a full shell/dotenv parser. **If it detects local syntax it cannot safely
reconcile, it refuses to modify the file** (including under `--check` or
`--unknown remove`). Shell directives, dangling quoted values, and line continuations
are examples. Errors give line numbers, never offending lines or values. Local blank
lines and ordinary comments are harmless but follow the template layout, so they may
be omitted. Unrecognized template lines pass through unchanged. For repeated keys,
the last assignment supplies the value and active/commented state.

Development (Python 3.10+; no runtime dependencies):

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m align_dotenv .env --template .env.example
```

See [PLANS.md](PLANS.md) for the phased roadmap.
