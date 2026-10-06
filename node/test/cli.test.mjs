import { promises as fs } from "node:fs";
import { EOL } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { main } from "../dist/cli.js";
import { check } from "./helpers.mjs";
import { checkBytes, fingerprint } from "./file-helpers.mjs";
import { pair, withProject, tree } from "./project-helpers.mjs";
import { checkResult, checkSafe, entry, runCli } from "./cli-helpers.mjs";

async function invoke(root, argv) {
  let stdout = "", stderr = "";
  const code = await main(argv, { cwd: root, stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout: stdout.replaceAll("\r\n", "\n"), stderr: stderr.replaceAll("\r\n", "\n") };
}

for (const argv of [["--help"], ["-h"]]) {
  test(`CLI process: ${argv[0]} is accurate and performs no preflight`, () => withProject(async (root) => {
    await pair(root, ".env", { local: "source example-secret\n" });
    const before = await tree(root);
    const result = await runCli(root, argv);
    check(result.code === 0 && result.stderr === "", "help failed");
    for (const text of ["usage: align-dotenv", "target", "--template", "--unknown", "keep,remove,error", "--check", "current directory"]) {
      check(result.stdout.includes(text), "help omits supported syntax");
    }
    checkSafe(result);
    check(await tree(root) === before, "help modified files");
  }));
}

for (const argv of [
  [".env"], ["--template", ".env.example"], ["--unknown", "example-secret"],
  ["--template"], ["--unknown"], ["--template", "--check"], ["--unknown", "--check"],
  ["--example-secret"], ["a", "b"], ["--check=example-secret"], ["--help=example-secret"],
]) {
  test(`CLI process: invalid invocation case ${JSON.stringify(argv.map((arg) => arg.includes("secret") ? "[redacted]" : arg))}`,
    () => withProject(async (root) => {
      const first = await pair(root);
      const before = await fingerprint(first.target), beforeTree = await tree(root);
      const result = await runCli(root, argv);
      check(result.code === 2 && result.stdout === "" && result.stderr.startsWith("usage: align-dotenv") &&
        result.stderr.includes("align-dotenv: error:"), "argument error contract mismatch");
      checkSafe(result);
      check(await fingerprint(first.target) === before && await tree(root) === beforeTree, "invalid arguments performed updates");
    }));
}

for (const role of ["target", "template"]) {
  test(`CLI process: invalid ${role} path`, () => withProject(async (root) => {
    const paths = await pair(root);
    await fs.unlink(paths[role]);
    checkResult(await runCli(root, [".env", "--template", ".env.example"]), 2, "",
      `align-dotenv: ${role} must be an existing regular file\n`);
  }));
}

test("CLI process: relative and absolute paths containing spaces", () => withProject(async (root) => {
  const { target, template } = await pair(root, "directory with spaces/.env local");
  const before = await fingerprint(target);
  checkResult(await runCli(root, [relative(root, target), "--template", relative(root, template), "--check"]),
    1, "Target is not aligned.\n");
  check(await fingerprint(target) === before, "spaced-path check wrote file");
  checkResult(await runCli(root, [target, "--template=" + template]), 0, "Updated target.\n");
  await checkBytes(target, "# Heading\nKEY=private-value\n");
}));

for (const count of [0, 1, 2]) {
  test(`CLI process: aligned project grammar count=${count}`, () => withProject(async (root) => {
    for (let i = 0; i < count; i++) await pair(root, `app${i}/.env`, { local: "# Heading\nKEY=private-value\n" });
    const expected = count === 1 ? "1 dotenv file is aligned.\n" : `All ${count} dotenv files are aligned.\n`;
    for (const argv of [[], ["--check"]]) checkResult(await runCli(root, argv), 0, expected);
  }));
}

for (const count of [1, 2]) {
  test(`CLI process: changed project grammar count=${count}`, () => withProject(async (root) => {
    const targets = [];
    for (let i = 0; i < count; i++) targets.push((await pair(root, `app${i}/.env`)).target);
    const before = await Promise.all(targets.map(fingerprint));
    checkResult(await runCli(root, ["--check"]), 1,
      count === 1 ? "1 dotenv file needs alignment.\n" : "2 dotenv files need alignment.\n");
    check(JSON.stringify(await Promise.all(targets.map(fingerprint))) === JSON.stringify(before), "project check wrote files");
    checkResult(await runCli(root), 0, count === 1 ? "Aligned 1 dotenv file.\n" : "Aligned 2 dotenv files.\n");
    for (const target of targets) await checkBytes(target, "# Heading\nKEY=private-value\n");
  }));
}

for (const count of [1, 2]) {
  test(`CLI process: skipped template grammar count=${count}`, () => withProject(async (root) => {
    const first = await pair(root);
    for (let i = 0; i < count; i++) {
      const missing = await pair(root, `skip${i}/.env`);
      await fs.unlink(missing.target);
    }
    const skipped = count === 1 ? "Skipped 1 template because its target does not exist.\n"
      : "Skipped 2 templates because their targets do not exist.\n";
    checkResult(await runCli(root, ["--check"]), 1, "1 dotenv file needs alignment.\n" + skipped);
    checkResult(await runCli(root), 0, "Aligned 1 dotenv file.\n" + skipped);
    checkResult(await runCli(root), 0, "1 dotenv file is aligned.\n" + skipped);
    await fs.unlink(first.target);
    const all = count + 1;
    checkResult(await runCli(root), 0, `All 0 dotenv files are aligned.\nSkipped ${all} templates because their targets do not exist.\n`);
  }));
}

test("CLI process: ambiguous mappings fail before updates", () => withProject(async (root) => {
  const first = await pair(root, "a/.env"), last = await pair(root, "z/.env");
  await fs.writeFile(last.target + ".template", "KEY=default\n");
  const before = await fingerprint(first.target);
  const message = `multiple templates resolve to ${relative(root, last.target)}: ${relative(root, last.template)}, ${relative(root, last.target + ".template")}; no files were changed`;
  for (const argv of [[], ["--check"]]) checkResult(await runCli(root, argv), 2, "", `align-dotenv: ${message}\n`);
  check(await fingerprint(first.target) === before, "ambiguity wrote earlier target");
}));

test("CLI process: project unknown keep/remove/error", () => withProject(async (root) => {
  const last = await pair(root, "nested/.env", { local: "KEY=private-value\nEXTRA=example-secret\n" });
  checkResult(await runCli(root, ["--unknown", "error"]), 2, "",
    `align-dotenv: ${relative(root, last.target)}: unknown local keys: EXTRA; no files were changed\n`);
  checkResult(await runCli(root, ["--unknown", "keep"]), 0, "Aligned 1 dotenv file.\n");
  await checkBytes(last.target, "# Heading\nKEY=private-value\n\nEXTRA=example-secret\n");
  checkResult(await runCli(root, ["--unknown", "remove"]), 0, "Aligned 1 dotenv file.\n");
  await checkBytes(last.target, "# Heading\nKEY=private-value\n");
}));

test("CLI main: output/cwd context and explicit mode", () => withProject(async (root) => {
  const first = await pair(root);
  checkResult(await invoke(root, [".env", "--template", ".env.example", "--check"]), 1, "Target is not aligned.\n");
  checkResult(await invoke(root, [".env", "--template", ".env.example"]), 0, "Updated target.\n");
  checkResult(await invoke(root, [".env", "--template", ".env.example"]), 0, "Target already aligned.\n");
  await checkBytes(first.target, "# Heading\nKEY=private-value\n");
}));

test("CLI main: help and argument errors never enumerate or open files", (t) => withProject(async (root) => {
  const read = t.mock.method(fs, "readdir", () => { throw new Error("example-secret unexpected discovery"); });
  const open = t.mock.method(fs, "open", () => { throw new Error("example-secret unexpected read"); });
  for (const argv of [["--help"], ["-h"], [".env"], ["--unknown", "example-secret"]]) {
    const result = await invoke(join(root, "nonexistent"), argv);
    check(result.code === (argv[0].includes("h") && argv.length === 1 ? 0 : 2), "early-return code mismatch");
    checkSafe(result);
  }
  check(read.mock.callCount() === 0 && open.mock.callCount() === 0, "help/argument parsing touched filesystem");
}));

for (const project of [false, true]) {
  test(`CLI main: generic I/O is normalized / project=${project}`, (t) => withProject(async (root) => {
    await pair(root);
    t.mock.method(fs, "readFile", () => { throw new Error("example-secret raw read failure"); });
    checkResult(await invoke(root, project ? [] : [".env", "--template", ".env.example"]), 2, "",
      "align-dotenv: cannot read or update files; check paths and permissions.\n");
  }));
}

test("CLI main: apply failure emits no success summary and cleans temporary", (t) => withProject(async (root) => {
  const first = await pair(root);
  const before = await tree(root);
  t.mock.method(fs, "rename", () => { throw new Error("example-secret replace failure"); });
  checkResult(await invoke(root, []), 2, "", "align-dotenv: cannot read or update files; check paths and permissions.\n");
  await checkBytes(first.target, "KEY=private-value\n");
  check(await tree(root) === before, "CLI replace failure leaked temporary");
}));

test("CLI main: inaccessible process cwd is normalized; help does not consult cwd", async (t) => {
  t.mock.method(process, "cwd", () => { throw new Error("example-secret inaccessible cwd"); });
  let stdout = "", stderr = "";
  const context = { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } };
  check(await main(["--help"], context) === 0 && stderr === "", "help consulted cwd");
  stdout = "";
  check(await main([], context) === 2, "cwd error exit mismatch");
  checkResult({ code: 2, stdout, stderr: stderr.replaceAll("\r\n", "\n") }, 2, "",
    "align-dotenv: cannot read or update files; check paths and permissions.\n");
});

test("CLI main: equals values, repeated options, abbreviations and -- separator", () => withProject(async (root) => {
  await pair(root, "-local");
  checkResult(await invoke(root, ["--temp=-local.example", "--unk=remove", "--unknown=keep", "--ch", "--", "-local"]),
    1, "Target is not aligned.\n");
}));

test("CLI build: executable entry retains shebang and platform output newline", () => withProject(async (root) => {
  check((await fs.readFile(entry, "utf8")).startsWith("#!/usr/bin/env node\n"), "compiled entry lost shebang");
  let output = "";
  check(await main([], { cwd: root, stdout: (text) => { output += text; } }) === 0, "empty main failed");
  check(output === "All 0 dotenv files are aligned." + EOL, "platform output newline mismatch");
}));
