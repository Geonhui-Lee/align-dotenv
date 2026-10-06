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
occurred; the Node manifest now explicitly permits the manual v0.3.0 bootstrap
with `private: false`, while automated npm publishing stays disabled.
`test:package` packs the artifact,
inspects its actual contents, installs it offline into a fresh external consumer,
then tests npm's generated bin/shim through scripts and npm exec. Do not replace
this gate with tests invoking repository `dist/bin.js` directly. Tarballs are
generated in owned temporary directories, cleaned afterward and ignored by git.

Node CI covers Ubuntu and Windows on Node 22 and 24. WSL local results validate
Linux only. macOS is not in the tested release matrix; do not add an npm `os`
restriction merely to reflect CI scope. Keep the package-local MIT license equal
to the root LICENSE. Only compiled JS/declarations, README, LICENSE and package.json
may ship; sources/tests/shared fixtures/planning files must stay out of the tarball.

## v0.3.0 manual npm bootstrap and future joint releases

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

`align-dotenv` does not yet exist on npm. A Trusted Publisher cannot be configured
until the package exists, so **v0.3.0 is a manual interactive first publication**
using the maintainer's npm account authentication and 2FA. `private: false` is now
authorized and prepared; it is not authorization for this agent to publish.
No npm token or credential is committed or added to Actions.

Manual steps for the maintainer, after separately authorizing publication:

1. Review this exact release commit and its green CI; recheck name/access and
   confirm `ENABLE_NPM_PUBLISHING` remains unset or disabled. A registry 404 does
   not guarantee reservability. Keep npm automation disabled through v0.3.0.
2. From a clean checkout of the release commit, run the documented Python/Node
   validation and `node scripts/check-versions.mjs --tag v0.3.0`.
3. Authenticate interactively with `npm login` and verify the account with
   `npm whoami`. From `node/`, generate and inspect `npm pack --json`, then publish
   the inspected `align-dotenv-0.3.0.tgz` with
   `npm publish ./align-dotenv-0.3.0.tgz --access public`, completing the 2FA prompt.
   Never put credentials or OTPs in the repository, logs, or committed commands.
   This local account-authenticated bootstrap does not promise OIDC provenance.
4. Verify npm `align-dotenv@0.3.0` metadata and a fresh install/CLI invocation.
   Separately create/push `v0.3.0` at the reviewed commit and publish the explicit
   GitHub Release when authorized. `publish.yml` then publishes PyPI 0.3.0 through
   its existing Trusted Publisher; approve its protected environment if required.
   The npm workflow must remain disabled and must not attempt to republish 0.3.0.
5. Verify PyPI installation and both distributions before marking v0.3.0 released.
   Uploads are not atomic; handle partial failures without republishing an already
   published version. Clean up the locally generated tarball without committing it.

**After v0.3.0**, configure npm's Trusted Publisher for future releases:

- Owner: **Geonhui-Lee**; repository: **align-dotenv**.
- Workflow: **publish-npm.yml**; environment: **npm**.
- Create/protect the GitHub **npm** environment with reviewer approval and release-tag
  restrictions. Permit the direct publishing action used by this draft; restrict
  traditional token access and do not introduce long-lived npm publishing tokens.
- Enable `ENABLE_NPM_PUBLISHING=true` only for the next unpublished version's
  release, after the v0.3.0 release event has completed. Do not rerun the v0.3.0
  npm workflow after enabling it. Future explicit GitHub Releases use OIDC and
  automatic npm provenance, with tag/version and platform validation intact.

Current official npm OIDC requirements are npm >=11.5.1 and Node >=22.14.0;
the draft uses Node 24 and checks the npm CLI version, with no npm access token.
See `.agents/NODE_PORT.md` for source guidance and CI evidence. No external account
settings, environments, variables, credentials or npm publisher were configured.
