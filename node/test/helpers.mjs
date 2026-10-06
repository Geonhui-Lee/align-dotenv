import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UnsupportedLocalSyntaxError } from "../dist/parser.js";
import { UnknownKeysError } from "../dist/reconcile.js";

// Assert booleans, never payloads: failed tests must not echo dotenv contents.
export function check(condition, message) {
  assert.ok(condition, `${message} (payload redacted)`);
}

export function loadCases(group) {
  const path = new URL(`../../fixtures/${group}/cases.json`, import.meta.url);
  const document = JSON.parse(readFileSync(path, "utf8"));
  check(document.schema_version === 1, "unsupported fixture schema");
  check(document.cases.length > 0, "empty fixture group");
  const ids = document.cases.map((item) => item.id);
  check(new Set(ids).size === ids.length, "duplicate fixture IDs");
  for (const item of document.cases) {
    for (const name of ["template", "local"]) {
      check((name in item) !== (`${name}_hex` in item), "ambiguous input representation");
    }
  }
  return document.cases;
}

export function inputBytes(item, name) {
  return name in item ? Buffer.from(item[name], "utf8") : Buffer.from(item[`${name}_hex`], "hex");
}

export function safeCall(action) {
  try {
    return action();
  } catch {
    throw new Error("unexpected core failure (payload redacted)");
  }
}

export function expectCoreError(action, expected) {
  let caught;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  const type = expected.kind === "unsupported_local_syntax"
    ? UnsupportedLocalSyntaxError : UnknownKeysError;
  check(caught instanceof type, "error type mismatch");
  check(caught.message === expected.message, "error message mismatch");
  const property = expected.kind === "unsupported_local_syntax" ? "lines" : "keys";
  check(JSON.stringify(caught[property]) === JSON.stringify(expected[property]),
    "error metadata mismatch");
  check(caught.name === type.name, "error name mismatch");
  return caught;
}
