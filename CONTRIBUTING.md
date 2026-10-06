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

The prepared Python and npm versions are `0.3.0`; this does not authorize
publishing either distribution. The Ubuntu/Windows Node 22/24 gate passed in
[Actions run 37423326194](https://github.com/Geonhui-Lee/align-dotenv/actions/runs/37423326194).
For an explicitly authorized future release,
require `vX.Y.Z == pyproject.toml == node/package.json == node/package-lock.json`
before a future joint GitHub release. `node scripts/check-versions.mjs` validates
all manifest/lockfile versions in CI; `--release` additionally requires the matching
`RELEASE_TAG` environment variable, and `--tag v0.3.0` is useful locally.

`publish.yml` retains the existing PyPI explicit-release event, tag check, `pypi`
environment and Trusted Publisher. It adds the stronger shared Python/npm version
guard. Separate `publish-npm.yml` uses the same explicit release event, reruns both
OS/Node matrix gates at the tagged source, then a protected `npm` environment and
OIDC/provenance publisher. It is inert until the repository variable
`ENABLE_NPM_PUBLISHING` equals `true`, and refuses to publish unless the manifest
explicitly says `private: false`. Ordinary pushes cannot publish.

Manual steps after separate final authorization:

1. Reconfirm npm name/access and initial-publication bootstrap; a registry 404
   does not guarantee reservability. No name is reserved by this checkout.
2. Configure npm's Trusted Publisher: owner **Geonhui-Lee**, repository
   **align-dotenv**, workflow **publish-npm.yml**, environment **npm**. This draft
   uses direct publishing, so explicitly permit that action (not only stage publish).
   Confirm any first-package bootstrap requirement with the package owner; if an
   initial interactive 2FA publish is necessary, authorize it separately.
3. Create/protect the GitHub **npm** environment with required reviewer approval
   and release-tag restrictions. Restrict tag changes and npm traditional token
   access; prefer 2FA and disallow long-lived publishing tokens.
4. After reviewing green final CI, separately authorize changing the one manifest
   line `"private": true` to `"private": false`, refresh the lockfile, and set
   `ENABLE_NPM_PUBLISHING=true`. Neither protection was changed here.
5. Only then authorize the `v0.3.0` tag/explicit GitHub release. No tag or release
   exists from this work. Verify both registries/provenance afterward before
   marking publication complete. Parallel distribution uploads are not atomic;
   handle a one-registry failure without republishing an existing version.

Current official npm OIDC requirements are npm >=11.5.1 and Node >=22.14.0;
the draft uses Node 24 and checks the npm CLI version, with no npm access token.
See `.agents/NODE_PORT.md` for source guidance and CI evidence. No external account
settings, environments, variables, credentials or npm publisher were configured.
