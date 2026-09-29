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

The version lives only in `pyproject.toml` (semantic versioning). Before the first
release, configure a PyPI Trusted Publisher for the GitHub repository
`Geonhui-Lee/align-dotenv`, workflow `publish.yml`, environment `pypi`; create the
matching `pypi` GitHub environment. CI must pass first. Publishing requires an
explicit GitHub release on a matching version tag such as `v0.1.0`; ordinary pushes
do not publish. Creating the GitHub release and publishing to PyPI are separate
milestones from having release-ready files in the repository.
