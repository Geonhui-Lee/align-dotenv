import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { applyProject, planProject } from "../dist/project.js";
import { checkBytes, fingerprint } from "./file-helpers.mjs";
import { check, inputBytes, loadCases } from "./helpers.mjs";
import { expectProjectError, pair, tree, withProject } from "./project-helpers.mjs";

for (const item of loadCases("reconciliation")) {
  test(`shared project: ${item.id}`, () => withProject(async (root) => {
    const original = inputBytes(item, "local"), sample = inputBytes(item, "template");
    const { target, template } = await pair(root, "nested/.env", { local: original, sample });
    const before = await fingerprint(target), beforeTree = await tree(root);
    const templateBefore = await fingerprint(template);
    const plan = await planProject(root, { unknown: item.unknown });
    check(plan.pairs.length === 1 && plan.skipped === 0, "fixture pair count mismatch");
    check(plan.pairs[0].target === target && plan.pairs[0].template === template, "fixture pairing mismatch");
    const changed = !original.equals(Buffer.from(item.expected));
    check(plan.updates.length === Number(changed), "fixture update count mismatch");
    if (changed) {
      check(plan.updates[0].content === item.expected, "staged content mismatch");
      check(plan.updates[0].mode === Number((await fs.stat(target, { bigint: true })).mode & 0o7777n),
        "staged mode mismatch");
    }
    await checkBytes(target, original);
    check(await fingerprint(target) === before && await tree(root) === beforeTree, "planning modified tree");
    await applyProject(plan);
    await checkBytes(target, item.expected);
    const aligned = await fingerprint(target);
    if (!changed) check(aligned === before, "unchanged fixture rewritten");
    if (item.followup_error) {
      await expectProjectError(() => planProject(root, { unknown: item.unknown }),
        `${relative(root, target)}: ${item.followup_error.message}; no files were changed`);
    } else {
      const second = await planProject(root, { unknown: item.unknown });
      check(second.updates.length === 0, "fixture not idempotent");
      await applyProject(second);
    }
    check(await fingerprint(target) === aligned, "second pass modified target");
    await checkBytes(template, sample);
    check(await fingerprint(template) === templateBefore && await tree(root) === beforeTree, "template/artifacts changed");
  }));
}

for (const item of loadCases("invalid")) {
  for (const unknown of item.policies) {
    test(`shared invalid project: ${item.id} / ${unknown}`, () => withProject(async (root) => {
      const first = await pair(root, "a/.env");
      const original = inputBytes(item, "local"), sample = inputBytes(item, "template");
      const last = await pair(root, "z/.env", { local: original, sample });
      const before = await fingerprint(first.target), lastBefore = await fingerprint(last.target);
      const beforeTree = await tree(root);
      await expectProjectError(() => planProject(root, { unknown }),
        `${relative(root, join(root, "z/.env"))}: ${item.error.message}; no files were changed`);
      await checkBytes(first.target, "KEY=private-value\n");
      await checkBytes(last.target, original);
      await checkBytes(last.template, sample);
      check(await fingerprint(first.target) === before && await fingerprint(last.target) === lastBefore,
        "late preflight error rewrote a file");
      check(await tree(root) === beforeTree, "failed preflight created artifacts");
    }));
  }
}
