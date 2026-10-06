import { AssertionError } from "node:assert";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIOError, FileValidationError, Utf8DecodingError } from "../dist/files.js";
import { UnsupportedLocalSyntaxError } from "../dist/parser.js";
import { UnknownKeysError } from "../dist/reconcile.js";
import { check } from "./helpers.mjs";

export async function withFiles(action) {
  const root = await fs.mkdtemp(join(tmpdir(), "align-dotenv-test-"));
  const target = join(root, ".env");
  const template = join(root, "template");
  try {
    await fs.writeFile(target, "KEY=private-value\n");
    await fs.writeFile(template, "# Heading\nKEY=default\n");
    await action({ root, target, template });
  } catch (error) {
    if (error instanceof AssertionError) throw error; // Only boolean, payload-free assertions.
    throw new Error("unexpected filesystem test failure (payload redacted)");
  } finally {
    // This directory is owned exclusively by this test, never a user directory.
    try {
      await fs.rm(root, { recursive: true, force: true });
    } catch {
      throw new Error("filesystem test cleanup failed (payload redacted)");
    }
  }
}

export async function fingerprint(path) {
  const info = await fs.stat(path, { bigint: true });
  // Reads may change atime; do not treat that as a rewrite.
  return [info.dev, info.ino, info.mode, info.size, info.mtimeNs].join("/");
}

export async function checkBytes(path, expected) {
  const bytes = typeof expected === "string" ? Buffer.from(expected, "utf8") : expected;
  check((await fs.readFile(path)).equals(bytes), "file bytes mismatch");
}

export async function checkArtifacts(root, expected = [".env", "template"]) {
  check(JSON.stringify((await fs.readdir(root)).sort()) === JSON.stringify([...expected].sort()),
    "unexpected temporary artifacts");
}

export async function expectFileError(action, expected) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  const types = {
    file_validation: FileValidationError,
    file_io: FileIOError,
    invalid_utf8: Utf8DecodingError,
    unsupported_local_syntax: UnsupportedLocalSyntaxError,
    unknown_keys: UnknownKeysError,
  };
  const type = types[expected.kind];
  check(caught instanceof type, "file error type mismatch");
  check(caught.message === expected.message && caught.name === type.name, "file error message mismatch");
  for (const property of ["lines", "keys"]) {
    if (property in expected) {
      check(JSON.stringify(caught[property]) === JSON.stringify(expected[property]), "file error metadata mismatch");
    }
  }
  for (const marker of ["private-value", "local-value", "example-secret"]) {
    check(!caught.message.includes(marker) && !caught.stack.includes(marker), "file error leaked a value");
  }
  check(caught.cause === undefined, "file error exposes a raw cause");
  return caught;
}
