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

Shared Python/future Node parity cases live in [`fixtures/`](fixtures/README.md).
Keep expected bytes and safe errors runtime-neutral; use case IDs rather than
payloads in assertion diagnostics. The porting contract and next-phase scope are
documented in [`.agents/NODE_PORT.md`](.agents/NODE_PORT.md).

For the functionally complete Node implementation (Node 22+, npm package root `node/`):

```bash
npm --prefix node ci
npm --prefix node run build
npm --prefix node test
npm --prefix node run test:package
```

See [`node/README.md`](node/README.md) for CLI usage and safety limitations.
Python remains the production/reference distribution; npm publication has not
occurred and the Node package remains private. `test:package` packs the artifact,
inspects its actual contents, installs it offline into a fresh external consumer,
then tests npm's generated bin/shim through scripts and npm exec. Do not replace
this gate with tests invoking repository `dist/bin.js` directly. Tarballs are
generated in owned temporary directories, cleaned afterward and ignored by git.

Node CI covers Ubuntu and Windows on Node 22 and 24. WSL local results validate
Linux only. macOS is not in the tested release matrix; do not add an npm `os`
restriction merely to reflect CI scope. Keep the package-local MIT license equal
to the root LICENSE. Only compiled JS/declarations, README, LICENSE and package.json
may ship; sources/tests/shared fixtures/planning files must stay out of the tarball.

## Future joint release (maintainers; not enabled)

The current preparatory npm version equals Python's `0.2.0`; it does not authorize
republishing Python or publishing npm. Choose the next version explicitly, then
require `vX.Y.Z == pyproject.toml == node/package.json == node/package-lock.json`
before a future joint GitHub release. Package validation already checks Python/npm
version equality. Both Ubuntu and Windows workspace/packed gates must pass.

The existing `publish.yml` PyPI workflow is unchanged: only explicit GitHub
releases whose tags match Python's version publish, using the `pypi` environment
and Trusted Publisher. A future npm workflow should use a protected `npm`
environment, explicit release event, tag/version checks, GitHub-hosted runner,
`id-token: write`, and npm Trusted Publishing with automatic provenance from this
public repository. Do not add a push-triggered publisher or long-lived npm token.

Keep `private: true` until separately authorized publication preparation. Confirm
name ownership and first-publication bootstrap with the maintainer; no npm account
settings, secrets or publishers have been configured. Current trusted-publishing
requirements and remaining steps are in `.agents/NODE_PORT.md`. Never publish,
create tags/releases, or mark publication complete during package validation.
