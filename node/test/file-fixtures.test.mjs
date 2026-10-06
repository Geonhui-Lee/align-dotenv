import { promises as fs } from "node:fs";
import test from "node:test";
import { alignFile } from "../dist/files.js";
import { check, inputBytes, loadCases } from "./helpers.mjs";
import { checkArtifacts, checkBytes, expectFileError, fingerprint, withFiles } from "./file-helpers.mjs";

for (const item of loadCases("reconciliation")) {
  test(`shared files: ${item.id}`, () => withFiles(async ({ root, target, template }) => {
    const original = inputBytes(item, "local");
    const sample = inputBytes(item, "template");
    const expected = Buffer.from(item.expected, "utf8");
    await fs.writeFile(target, original);
    await fs.writeFile(template, sample);
    const before = await fingerprint(target);
    const templateBefore = await fingerprint(template);
    const changed = !original.equals(expected);
    check(await alignFile(target, template, { unknown: item.unknown, check: true }) === changed,
      "check result mismatch");
    await checkBytes(target, original);
    check(await fingerprint(target) === before, "check rewrote target");
    await checkArtifacts(root);
    check(await alignFile(target, template, { unknown: item.unknown }) === changed, "write result mismatch");
    await checkBytes(target, expected);
    const aligned = await fingerprint(target);
    if (!changed) check(aligned === before, "unchanged target rewritten");
    for (const checkOnly of [false, true]) {
      const action = () => alignFile(target, template, { unknown: item.unknown, check: checkOnly });
      if (item.followup_error) await expectFileError(action, item.followup_error);
      else check(await action() === false, "second pass did not report unchanged");
      await checkBytes(target, expected);
      check(await fingerprint(target) === aligned, "second pass rewrote target");
    }
    await checkBytes(template, sample);
    check(await fingerprint(template) === templateBefore, "template rewritten");
    await checkArtifacts(root);
  }));
}

// Includes the formerly deferred malformed UTF-8 bytes in either input file.
for (const item of loadCases("invalid")) {
  for (const policy of item.policies) {
    for (const checkOnly of [false, true]) {
      test(`shared invalid files: ${item.id} / ${policy} / check=${checkOnly}`,
        () => withFiles(async ({ root, target, template }) => {
          const original = inputBytes(item, "local");
          const sample = inputBytes(item, "template");
          await fs.writeFile(target, original);
          await fs.writeFile(template, sample);
          const before = await fingerprint(target);
          const templateBefore = await fingerprint(template);
          await expectFileError(() => alignFile(target, template, { unknown: policy, check: checkOnly }), item.error);
          await checkBytes(target, original);
          await checkBytes(template, sample);
          check(await fingerprint(target) === before, "failed alignment rewrote target");
          check(await fingerprint(template) === templateBefore, "failed alignment rewrote template");
          await checkArtifacts(root);
        }));
    }
  }
}
