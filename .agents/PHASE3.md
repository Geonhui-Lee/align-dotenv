# v0.4.0 Phase 3 — retire native TypeScript

## Entry gate and branch

Phase 2 final commit `c75f86e3d3859609cd418d6711b89f5e1decf435` was fast-forward
merged into `develop` without rewriting history. All existing develop gates passed:
baseline `37478221320`, standalone `37478221414`, and native npm `37478221291`
(both x64 platforms, Node 22/24/26) before this branch was created.

Dedicated branch: `build/retire-native-typescript`. Versions remain 0.3.1.

## Retirement boundary

- Remove `node/src/`, `node/tsconfig.json`, TypeScript/@types/node dependencies,
  compiler/prepack scripts, the reference bin/files declarations, and tests/helpers
  that existed solely to exercise that implementation, including its packed gate.
- Keep `node/` as the private dependency-free test workspace; preserve synchronized
  workspace/lockfile/main/platform versions and every version guard.
- Keep `node/npm/` manifests and launcher unchanged. No JavaScript dotenv business
  logic, fallback, downloads or production Python changes are introduced.
- Keep all shared fixture JSON and Python tests unchanged. Native integration now
  compares canonical Python CLI, real standalone and installed npm wrapper (three
  engines instead of four); help/output must match across all remaining engines.
- Preserve staging rejection, hash/provenance, tar allowlists/scans, installed byte
  equality, offline install/lock/ci, automatic platform selection, real npx/exec/script/
  Windows .cmd, no-Python PATH, redaction, link/mode/no-write/preflight, replacement
  failure, omitted optional package, missing binary and executable permission tests.
- Expand invalid-fixture wrapper comparisons to every listed policy in both normal
  and check modes, retaining the retired reference boundary coverage on the actual
  packaged implementation rather than just deleting it.
- Test counts decrease only because reference-only tests are removed; the native
  package gate cannot skip in native CI. Local unconfigured artifact skips are not
  proof. Existing standalone artifact coverage remains unchanged.

Ignored generated dist/node_modules/tarball files are not the distribution and are
not removed as part of tracked retirement. Fresh CI uses no compiler or old dist.
Historical port decisions remain in NODE_PORT.md and normal Git history.

## Completion gate

Phase 3 requires fresh green baseline Python/packaging/launcher/version CI,
standalone artifact tests on both targets, and all six real native npm consumer
jobs on the final pushed commit after retirement. Implementation is not itself
completion. No additional merge of this branch is authorized by the Phase 2 merge.

No version bump, package publication, tag, release, Composer work, unsupported
platform expansion, or change to unrelated untracked `uv.lock` is authorized.
Publication remains blocked; Phase 3 does not prepare platform release automation.
