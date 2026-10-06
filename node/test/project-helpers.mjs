import { AssertionError } from "node:assert";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ProjectValidationError } from "../dist/project.js";
import { check } from "./helpers.mjs";

export async function withProject(action) {
  const root = await fs.mkdtemp(join(tmpdir(), "align-dotenv-project-"));
  try {
    await action(root);
  } catch (error) {
    if (error instanceof AssertionError) throw error;
    throw new Error("unexpected project test failure (payload redacted)");
  } finally {
    try {
      await fs.rm(root, { recursive: true, force: true });
    } catch {
      throw new Error("project test cleanup failed (payload redacted)");
    }
  }
}

export async function pair(root, name = ".env", {
  suffix = ".example", local = "KEY=private-value\n", sample = "# Heading\nKEY=default\n",
} = {}) {
  const target = join(root, name), template = target + suffix;
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, local);
  await fs.writeFile(template, sample);
  return { target, template };
}

export async function expectProjectError(action, message) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  check(caught instanceof ProjectValidationError, "project error type mismatch");
  check(caught.name === "ProjectValidationError" && caught.message === message, "project error message mismatch");
  for (const marker of ["private-value", "local-value", "example-secret"]) {
    check(!caught.message.includes(marker) && !caught.stack.includes(marker), "project error leaked values");
  }
  check(caught.cause === undefined, "project error retains unsafe cause");
}

export async function symlink(t, referent, path, type = "file") {
  try {
    await fs.symlink(referent, path, type);
    return true;
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
      t.skip("Windows runner cannot create this symlink fixture (privilege/capability required)");
      return false;
    }
    throw error;
  }
}

export async function tree(root) {
  const result = [];
  async function walk(directory, prefix) {
    for (const name of (await fs.readdir(directory)).sort()) {
      const path = join(directory, name), label = prefix + name;
      const info = await fs.lstat(path);
      result.push(label);
      if (info.isDirectory()) await walk(path, label + "/");
    }
  }
  await walk(root, "");
  return JSON.stringify(result);
}
