import { promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { alignFile } from "../dist/files.js";
import { check } from "./helpers.mjs";
import { checkArtifacts, checkBytes, expectFileError, fingerprint, withFiles } from "./file-helpers.mjs";

const ORIGINAL = "KEY=private-value\n";
const ALIGNED = "# Heading\nKEY=private-value\n";
const IO_ERROR = { kind: "file_io", message: "cannot read or update files; check paths and permissions." };
const validation = (message) => ({ kind: "file_validation", message });

test("files: complete same-directory write, close, chmod, then replacement", (t) =>
  withFiles(async ({ root, target, template }) => {
    const events = [];
    const realOpen = fs.open;
    const realChmod = fs.chmod;
    const realRename = fs.rename;
    const realUnlink = fs.unlink;
    const mode = Number((await fs.stat(target, { bigint: true })).mode & 0o7777n);
    let temporary;
    t.mock.method(fs, "open", async (...args) => {
      const handle = await realOpen(...args);
      if (args[1] === "wx") {
        temporary = args[0];
        check(dirname(temporary) === dirname(target), "temporary file created outside target directory");
        check(/^\.align-dotenv-[a-f0-9]{32}\.tmp$/.test(basename(temporary)), "temporary name lacks randomness");
        check(args[2] === 0o600, "initial temporary mode is not private");
        const realWrite = handle.writeFile.bind(handle);
        const realClose = handle.close.bind(handle);
        t.mock.method(handle, "writeFile", async (...writeArgs) => {
          await realWrite(...writeArgs);
          events.push("write");
          await checkBytes(temporary, ALIGNED);
          await checkBytes(target, ORIGINAL);
        });
        t.mock.method(handle, "close", async () => { await realClose(); events.push("close"); });
      }
      return handle;
    });
    t.mock.method(fs, "chmod", async (path, bits) => {
      check(path === temporary && bits === mode, "mode applied to wrong file or with wrong bits");
      check(events.join(",") === "write,close", "chmod occurred before complete write/close");
      await checkBytes(target, ORIGINAL);
      await realChmod(path, bits);
      events.push("chmod");
    });
    t.mock.method(fs, "rename", async (from, to) => {
      check(from === temporary && to === target, "replacement paths mismatch");
      check(events.join(",") === "write,close,chmod", "replacement occurred before preparation");
      await checkBytes(target, ORIGINAL);
      await realRename(from, to);
      events.push("rename");
    });
    t.mock.method(fs, "unlink", async (path) => {
      check(path !== target && path === temporary, "cleanup attempted to delete target or foreign file");
      return realUnlink(path);
    });
    check(await alignFile(target, template) === true, "alignment should report a change");
    check(events.join(",") === "write,close,chmod,rename", "replacement sequence mismatch");
    await checkBytes(target, ALIGNED);
    await checkArtifacts(root);
  }));

test("files: check mode and unchanged files never create temporaries, chmod or rename", (t) =>
  withFiles(async ({ root, target, template }) => {
    const realOpen = fs.open;
    let temporaryOpens = 0;
    t.mock.method(fs, "open", async (...args) => {
      if (args[1] === "wx") temporaryOpens++;
      return realOpen(...args);
    });
    const rename = t.mock.method(fs, "rename", () => { throw new Error("example-secret unexpected rename"); });
    const chmod = t.mock.method(fs, "chmod", () => { throw new Error("example-secret unexpected chmod"); });
    for (const [content, checkOnly, expected] of [[ORIGINAL, true, true], [ALIGNED, true, false], [ALIGNED, false, false]]) {
      await fs.writeFile(target, content);
      const before = await fingerprint(target);
      check(await alignFile(target, template, { check: checkOnly }) === expected, "no-write result mismatch");
      await checkBytes(target, content);
      check(await fingerprint(target) === before, "no-write path changed file identity or metadata");
    }
    check(temporaryOpens === 0 && rename.mock.callCount() === 0 && chmod.mock.callCount() === 0,
      "no-write path invoked update operations");
    await checkArtifacts(root);
  }));

for (const [name, role, directory] of [
  ["missing target", "target", false], ["missing template", "template", false],
  ["target directory", "target", true], ["template directory", "template", true],
]) {
  test(`files: reject ${name}`, () => withFiles(async (paths) => {
    await fs.unlink(paths[role]);
    if (directory) await fs.mkdir(paths[role]);
    const other = role === "target" ? paths.template : paths.target;
    const before = await fingerprint(other);
    for (const checkOnly of [false, true]) {
      await expectFileError(() => alignFile(paths.target, paths.template, { check: checkOnly }),
        validation(`${role} must be an existing regular file`));
      check(await fingerprint(other) === before, "validation failure changed other file");
    }
    await checkArtifacts(paths.root, directory ? [".env", "template"] : [basename(other)]);
  }));
}

for (const kind of ["regular", "dangling", "directory"]) {
  test(`files: reject ${kind} target symlink without following it`, (t) =>
    withFiles(async ({ root, target, template }) => {
      const referent = kind === "regular" ? template : join(root, "referent");
      if (kind === "directory") await fs.mkdir(referent);
      await fs.unlink(target);
      await fs.symlink(referent, target, kind === "directory" ? "dir" : "file");
      const original = await fs.readFile(template);
      const stat = t.mock.method(fs, "stat", () => { throw new Error("example-secret unexpected stat"); });
      const open = t.mock.method(fs, "open", () => { throw new Error("example-secret unexpected open"); });
      for (const checkOnly of [false, true]) {
        await expectFileError(() => alignFile(target, template, { check: checkOnly }),
          validation("target must not be a symbolic link"));
      }
      check(stat.mock.callCount() === 0 && open.mock.callCount() === 0, "target symlink was followed");
      check((await fs.lstat(target)).isSymbolicLink(), "target link was modified");
      await checkBytes(template, original);
      await checkArtifacts(root, kind === "directory" ? [".env", "template", "referent"] : [".env", "template"]);
    }));
}

test("files: identical paths are rejected", () => withFiles(async ({ root, target }) => {
  const before = await fingerprint(target);
  await expectFileError(() => alignFile(target, target), validation("target and template must be different files"));
  await checkBytes(target, ORIGINAL);
  check(await fingerprint(target) === before, "same-path validation changed target");
  await checkArtifacts(root);
}));

test("files: different hard-link paths to the same file are rejected", () =>
  withFiles(async ({ root, target, template }) => {
    await fs.unlink(template);
    await fs.link(target, template);
    const before = await fingerprint(target);
    for (const checkOnly of [false, true]) {
      await expectFileError(() => alignFile(target, template, { check: checkOnly }),
        validation("target and template must be different files"));
    }
    await checkBytes(target, ORIGINAL);
    await checkBytes(template, ORIGINAL);
    check(await fingerprint(target) === before, "hard-link validation changed target");
    await checkArtifacts(root);
  }));

test("files: replacement leaves a different hard-linked alias's old bytes intact", () =>
  withFiles(async ({ root, target, template }) => {
    const alias = join(root, "alias");
    await fs.link(target, alias);
    const before = await fingerprint(alias);
    check(await alignFile(target, template) === true, "hard-linked target should align");
    await checkBytes(target, ALIGNED);
    await checkBytes(alias, ORIGINAL);
    check(await fingerprint(alias) === before, "replacement wrote through the original inode");
    const first = await fs.stat(target, { bigint: true });
    const second = await fs.stat(alias, { bigint: true });
    check(first.ino !== second.ino, "target was not replaced with a different file");
    await checkArtifacts(root, [".env", "template", "alias"]);
  }));

test("files: explicit mode permits a regular-file template symlink", () =>
  withFiles(async ({ root, target, template }) => {
    const sample = join(root, "sample");
    await fs.rename(template, sample);
    await fs.symlink(sample, template, "file");
    check(await alignFile(target, template) === true, "template symlink was not permitted");
    await checkBytes(target, ALIGNED);
    await checkBytes(sample, "# Heading\nKEY=default\n");
    check((await fs.lstat(template)).isSymbolicLink(), "template symlink was modified");
    await checkArtifacts(root, [".env", "template", "sample"]);
  }));

test("files: template symlink to target is rejected by identity", () =>
  withFiles(async ({ root, target, template }) => {
    await fs.unlink(template);
    await fs.symlink(target, template, "file");
    await expectFileError(() => alignFile(target, template), validation("target and template must be different files"));
    await checkBytes(target, ORIGINAL);
    await checkArtifacts(root);
  }));

test("files: dangling template symlink is not a regular file", () =>
  withFiles(async ({ root, target, template }) => {
    await fs.unlink(template);
    await fs.symlink(join(root, "missing"), template, "file");
    await expectFileError(() => alignFile(target, template), validation("template must be an existing regular file"));
    await checkBytes(target, ORIGINAL);
    await checkArtifacts(root);
  }));

test("files: unavailable identity fails closed instead of comparing path strings", (t) =>
  withFiles(async ({ root, target, template }) => {
    const realLstat = fs.lstat;
    t.mock.method(fs, "lstat", async (...args) => {
      const info = await realLstat(...args);
      info.ino = 0n;
      return info;
    });
    await expectFileError(() => alignFile(target, template), validation("cannot determine file identity safely"));
    await checkBytes(target, ORIGINAL);
    await checkArtifacts(root);
  }));

test("files: identities differing above number precision are not conflated", (t) =>
  withFiles(async ({ root, target, template }) => {
    const realLstat = fs.lstat;
    const realStat = fs.stat;
    const dev = (await realStat(target, { bigint: true })).dev;
    t.mock.method(fs, "lstat", async (...args) => {
      const info = await realLstat(...args);
      info.ino = 2n ** 60n;
      info.dev = dev;
      return info;
    });
    t.mock.method(fs, "stat", async (...args) => {
      const info = await realStat(...args);
      info.ino = 2n ** 60n + 1n;
      info.dev = dev;
      return info;
    });
    check(await alignFile(target, template, { check: true }) === true, "bigint identities lost precision");
    await checkBytes(target, ORIGINAL);
    await checkArtifacts(root);
  }));

for (const mode of [0o600, 0o640]) {
  test(`files: preserve POSIX mode ${mode.toString(8)}`, {
    skip: process.platform === "win32" ? "Windows chmod cannot represent POSIX owner/group permissions" : false,
  }, () => withFiles(async ({ root, target, template }) => {
    await fs.chmod(target, mode);
    check(await alignFile(target, template) === true, "mode case did not update");
    check(Number((await fs.stat(target, { bigint: true })).mode & 0o7777n) === mode, "mode bits changed");
    await checkArtifacts(root);
  }));
}

test("files: UTF-8 BOM in a template is retained, not stripped", () =>
  withFiles(async ({ root, target, template }) => {
    await fs.writeFile(template, "\ufeff# Heading\nKEY=default\r\n");
    check(await alignFile(target, template) === true, "BOM template did not update");
    await checkBytes(target, "\ufeff# Heading\nKEY=private-value\r\n");
    await checkArtifacts(root);
  }));

test("files: valid UTF-8 replacement characters are preserved as raw values", () =>
  withFiles(async ({ root, target, template }) => {
    await fs.writeFile(target, "KEY=local-value\ufffd\n");
    check(await alignFile(target, template) === true, "valid replacement character was rejected");
    await checkBytes(target, "# Heading\nKEY=local-value\ufffd\n");
    await checkArtifacts(root);
  }));

for (const stage of ["create", "write", "close", "chmod", "rename", "read"]) {
  test(`files: injected ${stage} failure preserves original and cleans owned temporary`, (t) =>
    withFiles(async ({ root, target, template }) => {
      const before = await fingerprint(target);
      const realOpen = fs.open;
      if (["create", "write", "close"].includes(stage)) {
        t.mock.method(fs, "open", async (...args) => {
          if (args[1] === "wx" && stage === "create") throw new Error("example-secret create failure");
          const handle = await realOpen(...args);
          if (args[1] === "wx") {
            if (stage === "write") {
              const realWrite = handle.writeFile.bind(handle);
              t.mock.method(handle, "writeFile", async () => {
                await realWrite("partial example-secret", "utf8");
                throw new Error("private-value write failure");
              });
            } else if (stage === "close") {
              const realClose = handle.close.bind(handle);
              t.mock.method(handle, "close", async () => {
                await realClose();
                throw new Error("private-value close failure");
              });
            }
          }
          return handle;
        });
      }
      if (stage === "chmod") t.mock.method(fs, "chmod", () => { throw new Error("example-secret chmod failure"); });
      if (stage === "read") t.mock.method(fs, "readFile", () => { throw new Error("example-secret read failure"); });
      const rename = t.mock.method(fs, "rename", () => {
        throw new Error("example-secret rename failure", { cause: "private-value" });
      });
      await expectFileError(() => alignFile(target, template), IO_ERROR);
      // Restore readFile before checking contents (the injected seam has already been exercised).
      if (stage === "read") t.mock.restoreAll();
      if (stage !== "rename") check(rename.mock.callCount() === 0, "replacement attempted after earlier failure");
      await checkBytes(target, ORIGINAL);
      check(await fingerprint(target) === before, "failed update changed file identity or metadata");
      await checkArtifacts(root);
    }));
}

test("files: target descriptor read failure closes handle without leaking values", (t) =>
  withFiles(async ({ root, target, template }) => {
    const realOpen = fs.open;
    let closed = false;
    t.mock.method(fs, "open", async (...args) => {
      const handle = await realOpen(...args);
      if (args[0] === target) {
        const realClose = handle.close.bind(handle);
        t.mock.method(handle, "readFile", () => { throw new Error("example-secret target read failure"); });
        t.mock.method(handle, "close", async () => { await realClose(); closed = true; });
      }
      return handle;
    });
    await expectFileError(() => alignFile(target, template), IO_ERROR);
    check(closed, "failed target read did not close handle");
    await checkBytes(target, ORIGINAL);
    await checkArtifacts(root);
  }));

test("files: observed symlink introduced before target read is refused", (t) =>
  withFiles(async ({ root, target, template }) => {
    const victim = join(root, "victim");
    const backup = join(root, "backup");
    await fs.writeFile(victim, "KEY=example-secret\n");
    const realRead = fs.readFile;
    t.mock.method(fs, "readFile", async (...args) => {
      const bytes = await realRead(...args);
      if (args[0] === template) {
        await fs.rename(target, backup);
        await fs.symlink(victim, target, "file");
      }
      return bytes;
    });
    await expectFileError(() => alignFile(target, template), validation("target must not be a symbolic link"));
    check((await fs.lstat(target)).isSymbolicLink(), "late target symlink overwritten");
    await checkBytes(victim, "KEY=example-secret\n");
    await checkBytes(backup, ORIGINAL);
    await checkArtifacts(root, [".env", "template", "victim", "backup"]);
  }));

test("files: actual native rename failure preserves the original and cleans temporary", (t) =>
  withFiles(async ({ root, target, template }) => {
    const blocked = join(root, "blocked");
    await fs.mkdir(blocked);
    const realRename = fs.rename;
    t.mock.method(fs, "rename", (from) => realRename(from, blocked)); // A file cannot replace a directory.
    const before = await fingerprint(target);
    await expectFileError(() => alignFile(target, template), IO_ERROR);
    await checkBytes(target, ORIGINAL);
    check(await fingerprint(target) === before, "native rename failure changed target");
    await checkArtifacts(root, [".env", "template", "blocked"]);
  }));

test("files: exclusive temporary collision is retried without deleting foreign file", (t) =>
  withFiles(async ({ root, target, template }) => {
    const realOpen = fs.open;
    let collision;
    let attempts = 0;
    t.mock.method(fs, "open", async (...args) => {
      if (args[1] === "wx") {
        attempts++;
        if (!collision) {
          collision = args[0];
          await fs.writeFile(collision, "example-secret foreign file");
          // Exercise the actual O_EXCL error, not a made-up collision code.
        }
      }
      return realOpen(...args);
    });
    check(await alignFile(target, template) === true && attempts === 2, "temporary collision was not retried");
    await checkBytes(collision, "example-secret foreign file");
    await checkBytes(target, ALIGNED);
    await checkArtifacts(root, [".env", "template", basename(collision)]);
  }));

for (const change of ["symlink", "directory", "missing"]) {
  test(`files: refuse ${change} target introduced before replacement`, (t) =>
    withFiles(async ({ root, target, template }) => {
      const victim = join(root, "victim");
      const backup = join(root, "backup");
      await fs.writeFile(victim, "KEY=example-secret\n");
      const realChmod = fs.chmod;
      const realRename = fs.rename;
      t.mock.method(fs, "chmod", async (path, mode) => {
        await realChmod(path, mode);
        await realRename(target, backup); // Simulate external change; preserve the original for inspection.
        if (change === "symlink") await fs.symlink(victim, target, "file");
        if (change === "directory") await fs.mkdir(target);
      });
      const rename = t.mock.method(fs, "rename", () => { throw new Error("example-secret unexpected rename"); });
      await expectFileError(() => alignFile(target, template),
        validation("target changed during alignment; refusing to update"));
      check(rename.mock.callCount() === 0, "unsafe target was replaced");
      await checkBytes(victim, "KEY=example-secret\n");
      await checkBytes(backup, ORIGINAL);
      if (change === "symlink") check((await fs.lstat(target)).isSymbolicLink(), "introduced symlink overwritten");
      await checkArtifacts(root, change === "missing" ? ["template", "victim", "backup"] : [".env", "template", "victim", "backup"]);
    }));
}
