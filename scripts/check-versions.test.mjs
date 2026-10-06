import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkVersions } from "./check-versions.mjs";

function versions(action, { python = "0.3.0", npm = "0.3.0", lock = "0.3.0", rootLock = lock } = {}) {
  const root = mkdtempSync(join(tmpdir(), "align-dotenv-versions-"));
  try {
    mkdirSync(join(root, "node"));
    writeFileSync(join(root, "pyproject.toml"), `[project]\nname = "align-dotenv"\nversion = "${python}"\n\n[project.urls]\nversion = "ignored"\n`);
    writeFileSync(join(root, "node/package.json"), JSON.stringify({ name: "align-dotenv", version: npm }));
    writeFileSync(join(root, "node/package-lock.json"), JSON.stringify({ name: "align-dotenv", version: lock, packages: { "": { name: "align-dotenv", version: rootLock } } }));
    action(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("version guard: current repository metadata matches", () => {
  assert.match(checkVersions(), /^\d+\.\d+\.\d+$/);
});
test("version guard: matching stable version and release tag", () => versions((root) => {
  assert.equal(checkVersions(root, "v0.3.0"), "0.3.0");
}));
test("version guard: divergent Python/npm versions fail clearly", () => versions((root) => {
  assert.throws(() => checkVersions(root), /pyproject.toml and node\/package.json versions differ/);
}, { npm: "0.2.0" }));
test("version guard: divergent lockfile version fails", () => versions((root) => {
  assert.throws(() => checkVersions(root), /package-lock.json identity\/version differs/);
}, { lock: "0.2.0" }));
test("version guard: divergent lock root version fails", () => versions((root) => {
  assert.throws(() => checkVersions(root), /package-lock.json identity\/version differs/);
}, { rootLock: "0.2.0" }));
test("version guard: mismatched release tag fails", () => versions((root) => {
  assert.throws(() => checkVersions(root, "v0.2.0"), /release tag must equal/);
}));
test("version guard: malformed metadata never echoes raw payload", () => versions((root) => {
  writeFileSync(join(root, "node/package.json"), "example-secret");
  assert.throws(() => checkVersions(root), /^Error: cannot read version metadata$/);
}));
test("version guard: release mode refuses a missing environment tag", () => {
  const env = { ...process.env }; delete env.RELEASE_TAG;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./check-versions.mjs", import.meta.url)), "--release"], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RELEASE_TAG is required/);
});
test("version guard: release mode verifies environment tag portably", () => {
  const script = fileURLToPath(new URL("./check-versions.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--release"], {
    env: { ...process.env, RELEASE_TAG: `v${checkVersions()}` }, encoding: "utf8",
  });
  assert.equal(result.status, 0);
  const bad = spawnSync(process.execPath, [script, "--release"], {
    env: { ...process.env, RELEASE_TAG: "v999.0.0" }, encoding: "utf8",
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /release tag must equal/);
});
