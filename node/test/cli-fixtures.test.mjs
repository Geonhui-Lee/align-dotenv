import { promises as fs } from "node:fs";
import { relative } from "node:path";
import test from "node:test";
import { check, loadCases, inputBytes } from "./helpers.mjs";
import { checkBytes, fingerprint } from "./file-helpers.mjs";
import { pair, tree, withProject } from "./project-helpers.mjs";
import { checkResult, runCli } from "./cli-helpers.mjs";

for (const item of loadCases("reconciliation")) {
  test(`CLI shared explicit: ${item.id}`, () => withProject(async (root) => {
    const original = inputBytes(item, "local"), sample = inputBytes(item, "template");
    const { target, template } = await pair(root, ".env", { local: original, sample });
    const argv = [".env", "--template", ".env.example", "--unknown", item.unknown];
    const before = await fingerprint(target), beforeTree = await tree(root);
    const changed = !original.equals(Buffer.from(item.expected));
    checkResult(await runCli(root, [...argv, "--check"]), changed ? 1 : 0,
      changed ? "Target is not aligned.\n" : "Target is aligned.\n");
    check(await fingerprint(target) === before && await tree(root) === beforeTree, "CLI check wrote files");
    await checkBytes(target, original);
    checkResult(await runCli(root, argv), 0, changed ? "Updated target.\n" : "Target already aligned.\n");
    await checkBytes(target, item.expected);
    const aligned = await fingerprint(target);
    if (item.followup_error) {
      checkResult(await runCli(root, argv), 2, "", `align-dotenv: ${item.followup_error.message}\n`);
    } else {
      checkResult(await runCli(root, argv), 0, "Target already aligned.\n");
      checkResult(await runCli(root, [...argv, "--check"]), 0, "Target is aligned.\n");
    }
    check(await fingerprint(target) === aligned, "CLI second pass rewrote target");
    await checkBytes(template, sample);
    check(await tree(root) === beforeTree, "CLI leaked temporary artifacts");
  }));
}

for (const item of loadCases("invalid")) {
  for (const unknown of item.policies) {
    for (const project of [false, true]) {
      test(`CLI shared invalid: ${item.id} / ${unknown} / project=${project}`, () => withProject(async (root) => {
        const first = project ? await pair(root, "a/.env") : undefined;
        const original = inputBytes(item, "local"), sample = inputBytes(item, "template");
        const last = await pair(root, project ? "z/.env" : ".env", { local: original, sample });
        const before = await fingerprint(last.target), beforeTree = await tree(root);
        const firstBefore = first ? await fingerprint(first.target) : undefined;
        const args = project ? [] : [".env", "--template", ".env.example"];
        const message = project && item.error.kind !== "invalid_utf8"
          ? `${relative(root, last.target)}: ${item.error.message}; no files were changed` : item.error.message;
        for (const checkOnly of [false, true]) {
          checkResult(await runCli(root, [...args, "--unknown", unknown, ...(checkOnly ? ["--check"] : [])]),
            2, "", `align-dotenv: ${message}\n`);
          await checkBytes(last.target, original);
          await checkBytes(last.template, sample);
          if (first) {
            await checkBytes(first.target, "KEY=private-value\n");
            check(await fingerprint(first.target) === firstBefore, "late CLI preflight failure wrote earlier target");
          }
          check(await fingerprint(last.target) === before && await tree(root) === beforeTree, "failed CLI mutated project");
        }
      }));
    }
  }
}
