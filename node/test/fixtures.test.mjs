import test from "node:test";
import { align, reconcile } from "../dist/reconcile.js";
import { check, expectCoreError, loadCases, safeCall } from "./helpers.mjs";

for (const item of loadCases("reconciliation")) {
  test(`shared reconciliation: ${item.id}`, () => {
    const result = safeCall(() => reconcile(item.template, item.local, item.unknown));
    check(result.content === item.expected, "content mismatch");
    check(Buffer.from(result.content, "utf8").equals(Buffer.from(item.expected, "utf8")),
      "UTF-8 output bytes mismatch");
    check(JSON.stringify(result.unknownKeys) === JSON.stringify(item.unknown_keys),
      "unknown keys mismatch");
    check(safeCall(() => align(item.template, item.local, item.unknown)) === item.expected,
      "align wrapper mismatch");
    if (item.followup_error) {
      expectCoreError(() => reconcile(item.template, result.content, item.unknown), item.followup_error);
    } else {
      const second = safeCall(() => reconcile(item.template, result.content, item.unknown));
      check(second.content === result.content, "not idempotent");
      const keys = item.unknown === "keep" ? item.unknown_keys : [];
      check(JSON.stringify(second.unknownKeys) === JSON.stringify(keys), "second-pass keys mismatch");
    }
  });
}

for (const item of loadCases("invalid")) {
  if (item.error.kind === "invalid_utf8") {
    continue; // Exercised through actual file reads in file-fixtures.test.mjs.
  }
  for (const policy of item.policies) {
    test(`shared invalid: ${item.id} / ${policy}`, () => {
      expectCoreError(() => reconcile(item.template, item.local, policy), item.error);
    });
  }
}
