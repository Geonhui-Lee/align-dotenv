# Development plan

## Phase 1 — Core extraction

- Create a small Python package with separate parser, reconciliation, file I/O, and CLI modules.
- Support a single `align-dotenv <target> --template <template>` operation.
- Keep local raw values and unknown variables; use the template's layout and atomic file replacement.
- Add baseline unit and CLI tests without external runtime dependencies.

## Phase 2 — Correctness and CLI safety

- Expand fixtures for supported dotenv syntax, CRLF, duplicate keys, and missing final newlines.
- Review file permissions, error handling, non-interactive behavior, and idempotency across platforms.
- Consider explicit policies for unknown variables rather than removing them implicitly.

## Phase 3 — Distribution and OSS readiness

- Prepare and verify PyPI releases and `uv tool install align-dotenv` / `pipx install align-dotenv`.
- Expand the README; add LICENSE, CONTRIBUTING, GitHub Actions, and versioning/release workflow.
- Polish CLI help and output.

## Phase 4 — Extended functionality (reassess after earlier phases)

- Consider `sync`, `check`, and `diff` commands, project-wide template discovery, configuration,
  CI-friendly checking, value-redacted structural diffs, and `keep`/`remove`/`ask` policies.
