import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { discover, planProject, applyProject } from "../dist/project.js";
import { check } from "./helpers.mjs";
import { checkBytes, expectFileError, fingerprint } from "./file-helpers.mjs";
import { expectProjectError, pair, symlink, tree, withProject } from "./project-helpers.mjs";

const ORIGINAL = "KEY=private-value\n", ALIGNED = "# Heading\nKEY=private-value\n";
const label = (root, name) => relative(root, join(root, name));
const fail = (root, name, message) => `${label(root, name)}: ${message}; no files were changed`;

test("project: suffixes, recursive discovery and deterministic component ordering", () => withProject(async (root) => {
  const names = ["z/.env.production", "a/.env.development", ".env", "frontend/.env.local", "backend/.env.runtime",
    "a.foo/.env", ".environment"];
  for (const name of names) await pair(root, name, { suffix: name.endsWith("production") ? ".template" : ".example" });
  for (const name of ["config.example", "settings.template", ".env.example.bak", ".ENV.example", ".env.EXAMPLE"]) {
    await fs.writeFile(join(root, name), "ignored");
  }
  const expected = [".env", ".environment", "a/.env.development", "a.foo/.env", "backend/.env.runtime", "frontend/.env.local", "z/.env.production"];
  for (let run = 0; run < 2; run++) {
    const pairs = await discover(root);
    check(JSON.stringify(pairs.map((p) => relative(root, p.target).split("\\").join("/"))) === JSON.stringify(expected),
      "discovery order or grammar mismatch");
    check(Object.isFrozen(pairs) && pairs.every(Object.isFrozen), "discovered pairs not immutable");
  }
  check((await planProject(root)).pairs.length === expected.length, "recursive plan count mismatch");
}));

test("project: Unicode code-point ordering rather than UTF-16 or locale", () => withProject(async (root) => {
  for (const name of ["\u{10000}/.env", "\ue000/.env", "Z/.env", "a/.env"]) await pair(root, name);
  const pairs = await discover(root);
  const expected = process.platform === "win32"
    ? ["a/.env", "Z/.env", "\ue000/.env", "\u{10000}/.env"]
    : ["Z/.env", "a/.env", "\ue000/.env", "\u{10000}/.env"];
  check(JSON.stringify(pairs.map((p) => relative(root, p.target).split("\\").join("/"))) === JSON.stringify(expected),
    "Unicode traversal order mismatch");
}));

test("project: excluded directories at every depth are not enumerated", (t) => withProject(async (root) => {
  await pair(root);
  const excluded = [".git", "node_modules", ".venv", "venv", "__pycache__"];
  for (const name of excluded) {
    await pair(root, `${name}/.env`);
    await pair(root, `nested/${name}/.env`);
  }
  const realRead = fs.readdir;
  t.mock.method(fs, "readdir", async (path, ...args) => {
    check(!excluded.some((name) => path.endsWith("/" + name) || path.endsWith("\\" + name)), "excluded directory enumerated");
    return realRead(path, ...args);
  });
  const pairs = await discover(root);
  check(pairs.length === 1 && pairs[0].target === join(root, ".env"), "excluded pairs discovered");
}));

test("project: directory symlinks are not traversed", (t) => withProject(async (root) => {
  await pair(root, "nested/.env");
  if (!await symlink(t, join(root, "nested"), join(root, "link"), "dir")) return;
  const pairs = await discover(root);
  check(pairs.length === 1 && pairs[0].target === join(root, "nested/.env"), "directory symlink traversed");
}));

test("project: template-looking directories are candidates, never traversed", () => withProject(async (root) => {
  await pair(root, ".env.example/inner/.env");
  const pairs = await discover(root);
  check(pairs.length === 1 && pairs[0].target === join(root, ".env"), "template directory discovery simplified");
  await expectProjectError(() => planProject(root),
    fail(root, ".env", "template must be an existing regular file, not a symbolic link"));
}));

test("project: template-looking directory symlink remains a candidate", (t) => withProject(async (root) => {
  await fs.mkdir(join(root, "ordinary"));
  if (!await symlink(t, join(root, "ordinary"), join(root, ".env.template"), "dir")) return;
  const pairs = await discover(root);
  check(pairs.length === 1, "directory symlink candidate ignored");
  await expectProjectError(() => planProject(root),
    fail(root, ".env", "template must be an existing regular file, not a symbolic link"));
}));

test("project: missing targets counted, omitted and never created", () => withProject(async (root) => {
  const first = await pair(root);
  const missing = await pair(root, "nested/.env", { suffix: ".template" });
  await fs.unlink(missing.target);
  // Missing targets' bytes are not read or reconciled, even if template is malformed UTF-8.
  await fs.writeFile(missing.template, Buffer.from([0xff]));
  const plan = await planProject(root);
  check(plan.skipped === 1 && plan.pairs.length === 1 && plan.pairs[0].target === first.target && plan.updates.length === 1,
    "missing target plan mismatch");
  await applyProject(plan);
  check(!(await fs.readdir(join(root, "nested"))).includes(".env"), "missing target created");
  await checkBytes(first.target, ALIGNED);
}));

for (const missing of [false, true]) {
  test(`project: ambiguity before reads or writes / missing=${missing}`, (t) => withProject(async (root) => {
    const first = await pair(root, "a/.env");
    const last = await pair(root, "z/.env");
    await fs.writeFile(last.target + ".template", "KEY=default\n");
    if (missing) await fs.unlink(last.target);
    const before = await fingerprint(first.target);
    const read = t.mock.method(fs, "readFile", () => { throw new Error("example-secret unexpected read"); });
    await expectProjectError(() => planProject(root),
      `multiple templates resolve to ${label(root, "z/.env")}: ${label(root, "z/.env.example")}, ${label(root, "z/.env.template")}; no files were changed`);
    check(read.mock.callCount() === 0 && await fingerprint(first.target) === before, "ambiguity did not fail before reads/writes");
  }));
}

test("project: discovered template cannot itself be a target", () => withProject(async (root) => {
  const first = await pair(root);
  await fs.writeFile(first.template + ".example", "KEY=default\n");
  const before = await fingerprint(first.target), beforeTree = await tree(root);
  await expectProjectError(() => planProject(root),
    fail(root, ".env.example", "a discovered template cannot also be a target"));
  check(await fingerprint(first.target) === before && await tree(root) === beforeTree, "collision modified project");
}));

test("project: missing template after discovery is rejected even with missing target", (t) => withProject(async (root) => {
  const missing = await pair(root);
  await fs.unlink(missing.target);
  const realLstat = fs.lstat;
  let observations = 0;
  t.mock.method(fs, "lstat", async (path, ...args) => {
    if (path === missing.template && ++observations === 2) await fs.unlink(path);
    return realLstat(path, ...args);
  });
  await expectProjectError(() => planProject(root),
    fail(root, ".env", "template must be an existing regular file, not a symbolic link"));
}));

test("project: unsupported syntax in the first pair also prevents all writes", () => withProject(async (root) => {
  const first = await pair(root, "a/.env", { local: "source example-secret\n" });
  const last = await pair(root, "z/.env");
  const before = await tree(root), identity = await fingerprint(last.target);
  await expectProjectError(() => planProject(root),
    fail(root, "a/.env", "unsupported local syntax at lines 1; no changes were made"));
  await checkBytes(first.target, "source example-secret\n");
  await checkBytes(last.target, ORIGINAL);
  check(await fingerprint(last.target) === identity && await tree(root) === before, "early syntax failure wrote files");
}));

for (const role of ["target", "template"]) {
  for (const kind of ["directory", "symlink", "dangling-symlink"]) {
    test(`project: reject ${role} ${kind} before earlier writes`, (t) => withProject(async (root) => {
      const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
      await fs.unlink(last[role]);
      if (kind === "directory") await fs.mkdir(last[role]);
      else if (!await symlink(t, kind === "symlink" ? first[role] : join(root, "missing"), last[role])) return;
      const before = await fingerprint(first.target), beforeTree = await tree(root);
      await expectProjectError(() => planProject(root),
        fail(root, "z/.env", `${role} must be an existing regular file, not a symbolic link`));
      await checkBytes(first.target, ORIGINAL);
      check(await fingerprint(first.target) === before && await tree(root) === beforeTree, "validation failure wrote earlier target");
    }));
  }
}

test("project: same-file hard links fail before writes", () => withProject(async (root) => {
  const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
  await fs.unlink(last.template);
  await fs.link(last.target, last.template);
  await expectProjectError(() => planProject(root), fail(root, "z/.env", "target and template must be different files"));
  await checkBytes(first.target, ORIGINAL);
  await checkBytes(last.target, ORIGINAL);
}));

test("project: planning invokes no filesystem update operations", (t) => withProject(async (root) => {
  await pair(root);
  const realOpen = fs.open;
  let creates = 0;
  t.mock.method(fs, "open", async (...args) => { if (args[1] === "wx") creates++; return realOpen(...args); });
  const write = t.mock.method(fs, "writeFile", () => { throw new Error("example-secret unexpected write"); });
  const rename = t.mock.method(fs, "rename", () => { throw new Error("example-secret unexpected rename"); });
  const chmod = t.mock.method(fs, "chmod", () => { throw new Error("example-secret unexpected chmod"); });
  const unlink = t.mock.method(fs, "unlink", () => { throw new Error("example-secret unexpected unlink"); });
  const plan = await planProject(root);
  check(plan.updates.length === 1 && creates === 0 && [write, rename, chmod, unlink].every((mock) => mock.mock.callCount() === 0),
    "planning performed update operations");
  check(Object.isFrozen(plan) && Object.isFrozen(plan.pairs) && Object.isFrozen(plan.updates) &&
    plan.pairs.every(Object.isFrozen) && plan.updates.every(Object.isFrozen), "plan not immutable");
}));

test("project: empty and skipped-only plans apply without writes", () => withProject(async (root) => {
  let plan = await planProject(root);
  check(plan.pairs.length === 0 && plan.updates.length === 0 && plan.skipped === 0, "empty plan mismatch");
  await applyProject(plan);
  const missing = await pair(root);
  await fs.unlink(missing.target);
  plan = await planProject(root);
  check(plan.pairs.length === 0 && plan.updates.length === 0 && plan.skipped === 1, "skipped-only plan mismatch");
  const before = await tree(root);
  await applyProject(plan);
  check(await tree(root) === before, "empty updates modified tree");
}));

test("project: aligned pairs remain counted but never replaced", (t) => withProject(async (root) => {
  const first = await pair(root, "a/.env", { local: ALIGNED });
  const second = await pair(root, "z/.env", { local: ALIGNED });
  const before = [await fingerprint(first.target), await fingerprint(second.target)];
  const plan = await planProject(root);
  const rename = t.mock.method(fs, "rename", () => { throw new Error("example-secret unexpected rename"); });
  check(plan.pairs.length === 2 && plan.updates.length === 0, "aligned plan mismatch");
  await applyProject(plan);
  check(rename.mock.callCount() === 0 && before[0] === await fingerprint(first.target) && before[1] === await fingerprint(second.target),
    "aligned targets replaced");
}));

test("project: application uses staged bytes/mode, not changed template or target content", () => withProject(async (root) => {
  const first = await pair(root);
  const plan = await planProject(root);
  const stagedMode = plan.updates[0].mode;
  await fs.writeFile(first.target, "KEY=local-value\n");
  await fs.writeFile(first.template, "source example-secret\n");
  if (process.platform !== "win32") await fs.chmod(first.target, 0o644);
  await applyProject(plan);
  await checkBytes(first.target, ALIGNED);
  if (process.platform !== "win32") check(Number((await fs.stat(first.target, { bigint: true })).mode & 0o7777n) === stagedMode,
    "application did not use staged mode");
}));

test("project: application does not revalidate or rewrite unchanged pairs", () => withProject(async (root) => {
  const first = await pair(root, "a/.env", { local: ALIGNED });
  const last = await pair(root, "z/.env");
  const plan = await planProject(root);
  check(plan.pairs.length === 2 && plan.updates.length === 1, "update subset mismatch");
  await fs.unlink(first.target);
  await fs.mkdir(first.target);
  await applyProject(plan);
  check((await fs.lstat(first.target)).isDirectory(), "unchanged pair revalidated or replaced");
  await checkBytes(last.target, ALIGNED);
}));

test("project: root directory symlink is traversed like Python os.walk", (t) => withProject(async (root) => {
  await pair(root, "actual/.env");
  const link = join(root, "link");
  if (!await symlink(t, join(root, "actual"), link, "dir")) return;
  const pairs = await discover(link);
  check(pairs.length === 1 && pairs[0].target === join(link, ".env"), "symlink root behavior mismatch");
}));

test("project: mode 0600 survives planned application", {
  skip: process.platform === "win32" ? "Windows chmod cannot represent POSIX owner/group permissions" : false,
}, () => withProject(async (root) => {
  const first = await pair(root);
  await fs.chmod(first.target, 0o600);
  const plan = await planProject(root);
  check(plan.updates[0].mode === 0o600, "mode not staged");
  await applyProject(plan);
  check(Number((await fs.stat(first.target, { bigint: true })).mode & 0o7777n) === 0o600, "planned mode lost");
}));

for (const kind of ["symlink", "directory", "missing"]) {
  test(`project: reject ${kind} introduced after preflight`, (t) => withProject(async (root) => {
    const first = await pair(root), victim = await pair(root, "victim/.env");
    const plan = await planProject(root);
    await fs.unlink(first.target);
    if (kind === "directory") await fs.mkdir(first.target);
    if (kind === "symlink" && !await symlink(t, victim.target, first.target)) return;
    const beforeTree = await tree(root), before = await fingerprint(victim.target);
    await expectFileError(() => applyProject(plan), {
      kind: "file_validation", message: "target changed since preflight; refusing to update",
    });
    await checkBytes(victim.target, ORIGINAL);
    check(await fingerprint(victim.target) === before && await tree(root) === beforeTree, "unsafe application wrote files/artifacts");
  }));
}

test("project: later native replace failure leaves earlier updates applied without rollback", (t) => withProject(async (root) => {
  const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
  const plan = await planProject(root), beforeTree = await tree(root);
  const realRename = fs.rename;
  let calls = 0;
  t.mock.method(fs, "rename", async (from, to) => {
    calls++;
    if (to === last.target) throw new Error("example-secret replacement failure");
    await realRename(from, to);
  });
  await expectFileError(() => applyProject(plan), { kind: "file_io", message: "cannot read or update files; check paths and permissions." });
  check(calls === 2, "updates not applied individually in sorted order");
  await checkBytes(first.target, ALIGNED);
  await checkBytes(last.target, ORIGINAL);
  check(await tree(root) === beforeTree, "failed application leaked temporary artifacts");
}));

test("project: later unsafe target does not rollback earlier application", () => withProject(async (root) => {
  const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
  const plan = await planProject(root);
  await fs.unlink(last.target);
  await expectFileError(() => applyProject(plan), { kind: "file_validation", message: "target changed since preflight; refusing to update" });
  await checkBytes(first.target, ALIGNED);
}));

test("project: lower I/O failure in later preflight is safely labelled", (t) => withProject(async (root) => {
  const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
  const realRead = fs.readFile;
  t.mock.method(fs, "readFile", async (path, ...args) => {
    if (path === last.template) throw new Error("example-secret unsafe OS failure", { cause: "private-value" });
    return realRead(path, ...args);
  });
  await expectProjectError(() => planProject(root), fail(root, "z/.env", "cannot read or update files; check paths and permissions."));
  await checkBytes(first.target, ORIGINAL);
}));

test("project: discovery enumeration failures are safe I/O errors", (t) => withProject(async (root) => {
  t.mock.method(fs, "readdir", () => { throw new Error("example-secret unsafe enumeration error"); });
  await expectFileError(() => discover(root), { kind: "file_io", message: "cannot read or update files; check paths and permissions." });
}));
