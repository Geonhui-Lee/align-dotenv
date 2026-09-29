# Development plan

## Phase 1 — Core extraction

- Create a small Python package with separate parser, reconciliation, file I/O, and CLI modules.
- Support a single `align-dotenv <target> --template <template>` operation.
- Keep local raw values and unknown variables; use the template's layout and atomic file replacement.
- Add baseline unit and CLI tests without external runtime dependencies.

## Phase 2 — Correctness and CLI safety (implemented)

- Expand fixtures for raw values, Unicode, empty values, LF/CRLF, duplicate keys, and final newlines.
- Add explicit `keep` (default), `remove`, and `error` policies for unknown assignments.
- Add non-writing `--check`, validate file paths, and keep user errors and output value-free.
- Test atomic failure cleanup, permissions, unchanged files, and idempotency.
- Document the narrow syntax scope and template-controlled line endings.

## Phase 2.5 — Local syntax safety (implemented)

- Refuse to align unsupported meaningful local lines and multiline-looking quoted values.
- Apply the same validation under `--check` and every unknown-key policy; never print values.
- Allow local blank lines and ordinary comments to follow the template layout.

## Phase 3 — Distribution and OSS readiness (released as v0.1.0)

- Validate metadata, wheel/sdist, and isolated installation; document PyPI/uv/pipx installation.
- Add README, MIT LICENSE, CONTRIBUTING, CI, and an explicit-release-only Trusted Publishing workflow.
- Keep version `0.1.0` in `pyproject.toml`; polish CLI help/output later if needed.
- **Release-ready:** repository and local distribution checks complete.
- **GitHub release:** [v0.1.0](https://github.com/Geonhui-Lee/align-dotenv/releases/tag/v0.1.0) published.
- **PyPI publication:** [align-dotenv 0.1.0](https://pypi.org/project/align-dotenv/0.1.0/) published through Trusted Publishing; public-index installation and CLI smoke test passed.

## Phase 4 — Extended functionality (reassess after earlier phases)

- Consider `sync` and `diff` commands, project-wide template discovery, configuration,
  value-redacted structural diffs, and interactive `ask` policy.
