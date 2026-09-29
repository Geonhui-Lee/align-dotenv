# align-dotenv

Align a local dotenv file with a template while keeping its existing values.

```bash
align-dotenv .env --template .env.example
```

The target must already exist. The template determines key order, comments, blank lines,
and assignment prefixes; existing local keys retain their raw value text and their
active/commented state. New template keys use the template's values. Unknown local
assignments are appended rather than deleted. A second run makes no further changes.
The CLI reports only whether the file changed; it does not display values.

Phase 1 supports single-line `KEY=value`, `export KEY=value`, `# KEY=value`, and
`# export KEY=value` assignments with names matching `[A-Za-z_][A-Za-z0-9_]*`.
It is not a full shell/dotenv parser: multiline values and other syntax are not
interpreted as assignments. Unrecognized template lines pass through unchanged.
Non-assignment lines unique to the local file are not retained.

Development (Python 3.10+; no runtime dependencies):

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m align_dotenv .env --template .env.example
```

See [PLANS.md](PLANS.md) for the phased roadmap.
