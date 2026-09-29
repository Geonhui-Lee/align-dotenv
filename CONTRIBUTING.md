# Contributing

Use Python 3.10–3.14. For a local editable installation, create an environment
and run `python -m pip install -e .` (or `uv pip install -e .` after activating it).
No runtime dependencies are required.

Run the tests before opening a pull request:

```bash
python -m unittest discover -s tests -v
python -m compileall -q src tests
```

Keep parsing, reconciliation, filesystem operations, and CLI output separate.
Include tests for behavior changes, especially failure paths. Reconciliation must
remain idempotent. If local syntax cannot be safely understood or preserved,
reject it instead of silently dropping it. Never use actual secrets in fixtures,
logs, or issue reports, and do not print dotenv values in errors.

## Release (maintainers)

The version lives only in `pyproject.toml` (semantic versioning). To release `v0.1.0`:

1. Ensure CI is green on the release commit.
2. Create the GitHub environment named exactly `pypi`.
3. Configure a PyPI Trusted Publisher: owner `Geonhui-Lee`, repository
   `align-dotenv`, workflow `publish.yml`, environment `pypi`.
4. Create a GitHub release tagged `v0.1.0` at that commit. Publishing runs only
   for an explicit GitHub release with a tag matching `pyproject.toml`; ordinary
   pushes do not publish.
5. Wait for the publish workflow to succeed, then verify installation from PyPI.
6. Only after both the GitHub release and PyPI publication succeed, update
   `.agents/PLANS.md` to mark Phase 3 released.
