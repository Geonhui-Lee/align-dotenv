import test from "node:test";
import {
  assignmentFromLine, assignments, physicalLines, UnsupportedLocalSyntaxError,
  validateLocalLines,
} from "../dist/parser.js";
import { align, reconcile, UnknownKeysError } from "../dist/reconcile.js";
import { check, expectCoreError, safeCall } from "./helpers.mjs";

test("test diagnostics: unexpected errors never expose input payloads", () => {
  let caught;
  try {
    safeCall(() => { throw new Error("example-secret"); });
  } catch (error) {
    caught = error;
  }
  check(caught instanceof Error, "unexpected error was swallowed");
  check(caught.message === "unexpected core failure (payload redacted)", "diagnostic not redacted");
  check(caught.cause === undefined && !caught.stack.includes("example-secret"), "error payload leaked");
});

test("parser: four assignment forms and ASCII key grammar", () => {
  for (const prefix of ["", "export ", "# ", "# export "]) {
    const line = `${prefix}_KEY9=private-value\r\n`;
    const result = safeCall(() => assignmentFromLine(line));
    check(result !== null, "assignment not recognized");
    check(result.key === "_KEY9" && result.value === "private-value", "assignment fields mismatch");
    check(result.line === line && result.commented === prefix.startsWith("#"), "raw line/state mismatch");
    check(Object.isFrozen(result), "assignment should be immutable");
  }
  for (const line of ["9KEY=example-secret\n", "BAD-KEY=example-secret\n",
    "키=example-secret\n", "EXPORT KEY=example-secret\n", "export KEY\n"]) {
    check(safeCall(() => assignmentFromLine(line)) === null, "unsupported assignment recognized");
  }
});

test("parser: physical lines split only LF and retain empty lines", () => {
  for (const [text, expected] of [
    ["", []], ["\n\n", ["\n", "\n"]],
    ["A=local-value\r\nB=private-value", ["A=local-value\r\n", "B=private-value"]],
    ["A=local-value\rprivate-value\u2028example-secret\u2029", ["A=local-value\rprivate-value\u2028example-secret\u2029"]],
  ]) {
    check(JSON.stringify(safeCall(() => physicalLines(text))) === JSON.stringify(expected),
      "physical lines mismatch");
  }
});

test("parser: duplicate map retains first-seen order and final raw assignment", () => {
  const lines = ["Z=local-value\n", "__proto__=example-secret\n", "constructor=local-value\n",
    "# export Z=private-value\r\n"];
  const result = safeCall(() => assignments(lines));
  check(result instanceof Map, "assignments must use Map");
  check(JSON.stringify([...result.keys()]) === JSON.stringify(["Z", "__proto__", "constructor"]),
    "insertion order mismatch");
  check(result.get("Z").value === "private-value" && result.get("Z").commented,
    "final assignment did not win");
  check(result.get("Z").line === lines[3], "final raw line mismatch");
});

test("parser: Python whitespace set, not JavaScript trim semantics", () => {
  const whitespace = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
    0x85, 0xa0, 0x1680, ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
    0x2028, 0x2029, 0x202f, 0x205f, 0x3000];
  for (const code of whitespace) {
    const character = String.fromCodePoint(code);
    check(safeCall(() => assignmentFromLine(`${character}KEY=private-value\n`))?.key === "KEY",
      "Python whitespace not recognized");
    safeCall(() => validateLocalLines([character]));
  }
  for (const code of [0x180e, 0x200b, 0xfeff]) {
    const character = String.fromCodePoint(code);
    check(safeCall(() => assignmentFromLine(`${character}KEY=private-value\n`)) === null,
      "non-Python whitespace recognized");
    expectCoreError(() => validateLocalLines([character]), {
      kind: "unsupported_local_syntax", lines: [1],
      message: "unsupported local syntax at lines 1; no changes were made",
    });
  }
});

test("parser: Python dot and end anchor preserve CR and Unicode value characters", () => {
  for (const value of ["local-value\rprivate-value", "local-value\u2028", "local-value\u2029", "local-value\r"]) {
    const line = `KEY=${value}\r\n`;
    check(safeCall(() => assignmentFromLine(line))?.value === value, "raw value mismatch");
  }
  // Python's $ can match before the final LF even for non-physical-line callers.
  check(safeCall(() => assignmentFromLine("KEY=private-value\n\n"))?.value === "private-value",
    "Python final LF anchor mismatch");
  check(safeCall(() => assignmentFromLine("KEY=private-value\n\r")) === null,
    "non-LF final anchor accepted");
});

test("parser: continuation and quote validation are deliberately narrow", () => {
  safeCall(() => validateLocalLines([
    "KEY=private-value\\\\\n", "KEY=private-value\\ \n", "# KEY=private-value\\\n",
    "KEY=private-value\\\r\r", "KEY=\u00a0\"private-value\n", "KEY=\"private-value\"trailing\n",
  ]));
  expectCoreError(() => validateLocalLines([
    "KEY=private-value\\\n", "# KEY='example-secret\n", "source example-secret\n",
  ]), {
    kind: "unsupported_local_syntax", lines: [1, 2, 3],
    message: "unsupported local syntax at lines 1, 2, 3; no changes were made",
  });
});

test("parser: only spaces and tabs precede ordinary local comments", () => {
  safeCall(() => validateLocalLines([" \t# Local note\n", "\u0085\n"]));
  expectCoreError(() => validateLocalLines(["\u0085# Local note\n"]), {
    kind: "unsupported_local_syntax", lines: [1],
    message: "unsupported local syntax at lines 1; no changes were made",
  });
});

test("errors: structured metadata is defensively copied and value-free", () => {
  const lines = [2, 4];
  const keys = ["A", "Z"];
  const syntax = new UnsupportedLocalSyntaxError(lines);
  const unknown = new UnknownKeysError(keys);
  lines.push(9);
  keys.push("OTHER");
  check(syntax instanceof Error && unknown instanceof Error, "custom errors must extend Error");
  check(Object.isFrozen(syntax.lines) && Object.isFrozen(unknown.keys), "metadata not frozen");
  check(syntax.lines.join(",") === "2,4" && unknown.keys.join(",") === "A,Z", "metadata not copied");
  check(syntax.message === "unsupported local syntax at lines 2, 4; no changes were made",
    "syntax message mismatch");
  check(unknown.message === "unknown local keys: A, Z", "unknown message mismatch");
});

test("reconciliation: invalid policy guard precedes parsing and never echoes input", () => {
  let caught;
  try {
    reconcile("", "source example-secret\n", "private-value");
  } catch (error) {
    caught = error;
  }
  check(caught instanceof RangeError, "invalid policy should raise RangeError");
  check(caught.message === "unknown policy must be keep, remove, or error", "unsafe policy message");
});

test("reconciliation: default policy and immutable result metadata", () => {
  const result = safeCall(() => reconcile("", "Z=private-value\nA=local-value\n"));
  check(result.content === "Z=private-value\nA=local-value\n", "default keep mismatch");
  check(result.unknownKeys.join(",") === "A,Z", "sorted keys mismatch");
  check(Object.isFrozen(result) && Object.isFrozen(result.unknownKeys), "result not immutable");
  check(safeCall(() => align("", "Z=private-value\n")) === "Z=private-value\n", "align default mismatch");
});

test("reconciliation: unrecognized template lines remain opaque", () => {
  const template = "# Heading\nINVALID-KEY=example-secret\nNEW=default\n";
  check(safeCall(() => align(template, "")) === template, "template was validated or changed");
  expectCoreError(() => align(template, template), {
    kind: "unsupported_local_syntax", lines: [2],
    message: "unsupported local syntax at lines 2; no changes were made",
  });
});
