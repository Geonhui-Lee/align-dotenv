/** Coordinated npm publication: dry plan by default, explicit protected OIDC opt-in only. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkVersions } from "./check-versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const order = ["@align-dotenv/linux-x64", "@align-dotenv/win32-x64", "align-dotenv"];

export function publicationPlan(bundle, { version, commit, tag }) {
  if (bundle.version !== version || bundle.sourceCommit !== commit || bundle.tag !== tag || tag !== `v${version}`) throw new Error("release bundle identity mismatch");
  if (bundle.npm.length !== 3 || new Set(bundle.npm.map((item) => item.name)).size !== 3) throw new Error("require exactly three npm packages");
  return order.map((name) => {
    const item = bundle.npm.find((item) => item.name === name);
    const filename = name === "align-dotenv" ? `align-dotenv-${version}.tgz` : `align-dotenv-${name.split("/")[1]}-${version}.tgz`;
    if (!item || item.version !== version || item.filename !== filename || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity)) throw new Error("npm bundle package mismatch");
    return item;
  });
}

export function assertPublicationApproved(policy, version) {
  if (policy.version !== version || ["licensingAuditComplete", "externalNpmSetupConfirmed", "protectedEnvironmentsConfirmed"].some((field) => policy[field] !== true)) {
    throw new Error("publication blocked: licensing, external npm setup and protected environments require confirmed review");
  }
}

export function verifyPublished(item, metadata) {
  if (metadata.name !== item.name || metadata.version !== item.version || metadata.dist?.integrity !== item.integrity || !metadata.dist?.attestations?.provenance) {
    throw new Error("existing npm version differs from validated artifact or lacks provenance; never republish it");
  }
}

export async function publishInOrder(plan, registry, publish) {
  // Preflight *all* immutable versions before making any registry mutation.
  const existing = await Promise.all(plan.map((item) => registry(item)));
  existing.forEach((metadata, index) => { if (metadata) verifyPublished(plan[index], metadata); });
  if (existing[2] && (!existing[0] || !existing[1])) throw new Error("main exists without both matching platforms; stop for maintainer investigation");
  for (let index = 0; index < plan.length; index++) {
    const item = plan[index];
    if (!existing[index]) await publish(item);
    const metadata = await registry(item);
    if (!metadata) throw new Error("published package is not yet visible; retry verification, not publication");
    verifyPublished(item, metadata);
  }
}

async function main() {
  const [directory, mode = "--plan"] = process.argv.slice(2);
  if (!directory || !["--plan", "--publish"].includes(mode) || process.argv.length > 4) throw new Error("usage: release-npm.mjs BUNDLE [--plan|--publish]");
  const version = checkVersions(root, process.env.RELEASE_TAG ?? `v${checkVersions(root)}`);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const bundle = JSON.parse(readFileSync(join(directory, "BUILD_METADATA.json")));
  const plan = publicationPlan(bundle, { version, commit, tag: `v${version}` });
  for (const item of plan) {
    const bytes = readFileSync(join(directory, "npm", item.filename));
    if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== item.integrity) throw new Error("release tarball integrity mismatch");
  }
  console.log(JSON.stringify({ version, commit, order: plan.map((item) => item.name), policy: bundle.releasePolicy }, null, 2));
  if (mode === "--plan") return; // No registry requests, OIDC or publication in dry runs.
  const policy = JSON.parse(readFileSync(join(root, "release-policy.json")));
  assertPublicationApproved(policy, version);
  assertPublicationApproved(bundle.releasePolicy, version);
  if (process.env.RELEASE_PUBLISH_AUTHORIZED !== "true" || process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== "Geonhui-Lee/align-dotenv") throw new Error("protected GitHub publication authorization required");
  if (process.env.RELEASE_TAG !== `v${version}` || process.env.EXPECTED_COMMIT !== commit) throw new Error("tagged source identity required");
  for (const key of ["NODE_AUTH_TOKEN", "NPM_TOKEN"]) if (process.env[key]) throw new Error("long-lived npm tokens forbidden");
  if (execFileSync("npm", ["config", "get", "registry"], { encoding: "utf8" }).trim() !== "https://registry.npmjs.org/") throw new Error("default public registry required");
  const [major, minor, patch] = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim().split(".").map(Number);
  if (!(major > 11 || major === 11 && (minor > 5 || minor === 5 && patch >= 1))) throw new Error("npm >=11.5.1 required for Trusted Publishing");
  const registry = async (item) => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(item.name)}/${item.version}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`npm verification HTTP ${response.status}; do not publish`);
    return response.json();
  };
  await publishInOrder(plan, registry, async (item) => {
    const result = spawnSync("npm", ["publish", resolve(directory, "npm", item.filename), "--provenance", "--access", "public", "--ignore-scripts"], { cwd: root, shell: false, stdio: "inherit" });
    if (result.status !== 0) throw new Error("npm publish failed; inspect immutable registry state before retry");
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
