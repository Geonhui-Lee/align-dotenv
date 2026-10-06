import assert from "node:assert/strict";
import test from "node:test";
import { publicationPlan, assertPublicationApproved, publishInOrder } from "./release-npm.mjs";

const version = "0.4.0", commit = "a".repeat(40), tag = `v${version}`;
const names = ["@align-dotenv/linux-x64", "@align-dotenv/win32-x64", "align-dotenv"];
const npm = names.map((name) => ({ name, version, filename: name === "align-dotenv" ? `align-dotenv-${version}.tgz` : `align-dotenv-${name.split("/")[1]}-${version}.tgz`, integrity: "sha512-YWJj" }));
const bundle = () => ({ version, sourceCommit: commit, tag, npm: structuredClone(npm) });
const published = (item) => ({ name: item.name, version, dist: { integrity: item.integrity, attestations: { provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } });

test("release: dry plan requires exact version/commit and three synchronized packages", () => {
  assert.deepEqual(publicationPlan(bundle(), { version, commit, tag }).map((item) => item.name), names);
  assert.throws(() => publicationPlan(bundle(), { version, commit: "b".repeat(40), tag }), /identity/);
  const invalid = bundle(); invalid.npm[0].filename = "../unexpected";
  assert.throws(() => publicationPlan(invalid, { version, commit, tag }), /package mismatch/);
});
test("release: incomplete external/licensing/protection prerequisites block publication", () => {
  assert.throws(() => assertPublicationApproved({ version }, version), /publication blocked/);
  assertPublicationApproved({ version, licensingAuditComplete: true, externalNpmSetupConfirmed: true, protectedEnvironmentsConfirmed: true }, version);
});
test("release: main publication follows verification of both platforms", async () => {
  const state = new Map(), events = [];
  await publishInOrder(npm, async (item) => { events.push(`verify:${item.name}`); return state.get(item.name); }, async (item) => { events.push(`publish:${item.name}`); state.set(item.name, published(item)); });
  assert.deepEqual(events.filter((event) => event.startsWith("publish:")), names.map((name) => `publish:${name}`));
  assert.ok(events.indexOf(`verify:${names[1]}`, 3) < events.indexOf("publish:align-dotenv"));
});
test("release: partial immutable publication is verified and never republished", async () => {
  const state = new Map([[names[0], published(npm[0])]]), writes = [];
  await publishInOrder(npm, async (item) => state.get(item.name), async (item) => { writes.push(item.name); state.set(item.name, published(item)); });
  assert.deepEqual(writes, names.slice(1));
});
test("release: mismatching existing version prevents every registry mutation", async () => {
  let writes = 0;
  await assert.rejects(publishInOrder(npm, async (item) => item.name === names[1] ? { ...published(item), version: "0.3.1" } : null, async () => { writes++; }), /never republish/);
  assert.equal(writes, 0);
});
test("release: invisible published platform stops before main", async () => {
  const writes = [];
  await assert.rejects(publishInOrder(npm, async () => null, async (item) => writes.push(item.name)), /not yet visible/);
  assert.deepEqual(writes, [names[0]]);
});
