/** Real executable-backed npm gate; run only with freshly staged distributions. */
import { spawn, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createServer } from "node:http";
import test from "node:test";
import { check, loadCases, inputBytes } from "../test/helpers.mjs";
import { fingerprint } from "../test/file-helpers.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const staging = process.env.ALIGN_DOTENV_NPM_STAGE;
const target = `${process.platform}-${process.arch}`;
const npmCli = process.env.npm_execpath;
const python = process.env.ALIGN_DOTENV_PYTHON;
const executable = process.env.ALIGN_DOTENV_EXE;
const otherTarball = process.env.ALIGN_DOTENV_NPM_OTHER_TARBALL;

async function run(command, args, cwd, env = process.env) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32" && command === process.env.ComSpec, timeout: 120000 });
    const stdout = [], stderr = [];
    child.stdout.on("data", (data) => stdout.push(data));
    child.stderr.on("data", (data) => stderr.push(data));
    child.on("error", () => reject(new Error("subprocess failed (details withheld)")));
    child.on("close", (code, signal) => {
      check(!signal, "unexpected subprocess signal");
      done({ code, stdout: Buffer.concat(stdout).toString().replaceAll("\r\n", "\n"), stderr: Buffer.concat(stderr).toString().replaceAll("\r\n", "\n") });
    });
  });
}

function tarEntries(archive) {
  const bytes = gunzipSync(archive), entries = new Map();
  const text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const prefix = text(header.subarray(345, 500));
    const name = (prefix ? prefix + "/" : "") + text(header.subarray(0, 100));
    const size = parseInt(text(header.subarray(124, 136)).trim(), 8);
    check(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= bytes.length, "invalid tar size");
    check(header[156] === 0 || header[156] === 48, "non-regular tar member");
    check(name.startsWith("package/") && !name.split("/").includes("..") && !entries.has(name), "unsafe tar path");
    entries.set(name.slice(8), bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test("executable-backed npm: real packed consumer and three-way parity", { skip: !staging, timeout: 900000 }, async (t) => {
  check(["linux-x64", "win32-x64"].includes(target), "native x64 target required");
  check(python && executable && npmCli && otherTarball, "real build/Python/npm/both platform tarball locations required");
  const temporary = await fs.mkdtemp(join(tmpdir(), "align-npm-executable-"));
  try {
    check(!resolve(temporary).startsWith(resolve(root) + "/"), "consumer must be outside checkout");
    const consumer = join(temporary, "consumer with spaces"), cache = join(temporary, "npm-cache"), tools = join(temporary, "tools");
    await fs.mkdir(consumer); await fs.mkdir(tools);
    await t.test("staging rejects stale identity, wrong digest/target and nonfresh destinations", async () => {
      const input = join(temporary, "invalid build"); await fs.mkdir(input);
      const metadata = JSON.parse(await fs.readFile(join(dirname(executable), "metadata.json"), "utf8"));
      await fs.copyFile(executable, join(input, metadata.filename));
      for (const patch of [{ commit: "0".repeat(40) }, { version: "9.9.9" }, { architecture: "arm64" }, { sha256: "0".repeat(64) }]) {
        await fs.writeFile(join(input, "metadata.json"), JSON.stringify({ ...metadata, ...patch }));
        const output = join(temporary, "rejected staging");
        const result = await run(process.execPath, [join(root, "scripts/pack-npm.mjs"), input, output], root);
        check(result.code === 1 && !result.stderr.includes(input), "staging rejection unsafe");
        check(!(await fs.readdir(temporary)).includes("rejected staging"), "rejected build created output");
      }
      await fs.writeFile(join(input, "metadata.json"), JSON.stringify(metadata));
      const output = join(temporary, "occupied staging"); await fs.mkdir(output);
      await fs.writeFile(join(output, "sentinel"), "owned sentinel");
      check((await run(process.execPath, [join(root, "scripts/pack-npm.mjs"), input, output], root)).code === 1, "existing staging accepted");
      check((await fs.readFile(join(output, "sentinel"), "utf8")) === "owned sentinel", "existing output overwritten");
    });
    const standalone = join(temporary, process.platform === "win32" ? "align-dotenv.exe" : "align-dotenv");
    await fs.copyFile(executable, standalone); await fs.chmod(standalone, 0o755);
    const node = join(tools, process.platform === "win32" ? "node.exe" : "node");
    await fs.copyFile(process.execPath, node); await fs.chmod(node, 0o755);
    // Even Windows system directories can contain py.exe; cmd.exe is absolute.
    const env = { ...process.env, PATH: tools,
      PYTHONHOME: join(temporary, "missing-python"), PYTHONPATH: join(temporary, "missing-modules"),
      npm_config_script_shell: process.platform === "win32" ? process.env.ComSpec : "/bin/sh",
      npm_config_cache: cache, npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" };
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === "path" && key !== "PATH") delete env[key];
    }
    delete env.npm_config_package; delete env.npm_config_call;
    const npm = (cwd, args) => run(node, [npmCli, ...args], cwd, env);
    const npmOk = (result, message) => {
      const code = result.stderr.match(/npm (?:error|ERR!) code ([A-Z0-9_]+)/)?.[1] ?? "unclassified";
      const lock = result.stderr.includes("Missing:") ? "missing-lock-entry" : result.stderr.includes("Invalid:") ? "invalid-lock-entry" : "";
      check(result.code === 0, `${message}; npm ${code} ${lock}`);
    };
    const npxCli = join(dirname(npmCli), "npx-cli.js");
    const paths = [];
    const filename = target === "linux-x64" ? "align-dotenv" : "align-dotenv.exe";
    const other = target === "linux-x64" ? "win32-x64" : "linux-x64";
    await t.test("tarball allowlists, metadata/integrity and payload scan before installation", async () => {
      for (const name of ["main", target]) {
        const result = await npm(join(staging, name), ["pack", "--json", "--pack-destination", temporary]);
        check(result.code === 0, "npm pack failed");
        const [report] = JSON.parse(result.stdout), path = join(temporary, report.filename);
        paths.push(path);
        await fs.mkdir(join(staging, "tarballs"), { recursive: true });
        await fs.copyFile(path, join(staging, "tarballs", report.filename));
        const entries = tarEntries(await fs.readFile(path));
        const expected = name === "main" ? ["LICENSE", "package.json", "bin/align-dotenv.js"] : ["LICENSE", "package.json", "metadata.json", `bin/${filename}`];
        check(JSON.stringify([...entries.keys()].sort()) === JSON.stringify(expected.sort()), "npm tar allowlist mismatch");
        check(entries.get("LICENSE").equals(await fs.readFile(join(root, "LICENSE"))), "license mismatch");
        const manifest = JSON.parse(entries.get("package.json"));
        check(!manifest.scripts, "no install/download scripts allowed");
        if (name === "main") {
          check(manifest.alignDotenvBuild?.version === manifest.version && manifest.alignDotenvBuild?.sourceCommit === execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), "launcher source/version identity mismatch");
        }
        if (name !== "main") {
          const metadata = JSON.parse(entries.get("metadata.json"));
          const bytes = entries.get(`bin/${filename}`);
          check(bytes.equals(await fs.readFile(executable)), "npm binary differs from built executable");
          check(metadata.bytes === bytes.length && metadata.sha256 === createHash("sha256").update(bytes).digest("hex"), "metadata digest mismatch");
          check(metadata.commit === execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), "source commit mismatch");
          check(metadata.version === manifest.version, "binary/platform version mismatch");
          check(manifest.os[0] === process.platform && manifest.cpu[0] === "x64", "platform selectors mismatch");
          console.log(`Verified ${manifest.name}@${manifest.version}: ${bytes.length} bytes; SHA-256 ${metadata.sha256}; Python ${metadata.python}; PyInstaller ${metadata.pyinstaller}; commit ${metadata.commit}`);
        }
        for (const bytes of entries.values()) {
          const content = bytes.toString("utf8");
          for (const marker of [root, homedir(), "private-value", "example-secret", "local-value"]) check(!content.includes(marker), "packed path/value leak");
          check(!/npm_[A-Za-z0-9]{36,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(content), "credential-like content");
        }
      }
      const entries = tarEntries(await fs.readFile(otherTarball));
      const otherFilename = other === "linux-x64" ? "align-dotenv" : "align-dotenv.exe";
      const expected = ["LICENSE", "package.json", "metadata.json", `bin/${otherFilename}`].sort();
      check(JSON.stringify([...entries.keys()].sort()) === JSON.stringify(expected), "foreign platform tar allowlist mismatch");
      check(entries.get("LICENSE").equals(await fs.readFile(join(root, "LICENSE"))), "foreign license mismatch");
      const manifest = JSON.parse(entries.get("package.json")), metadata = JSON.parse(entries.get("metadata.json"));
      check(!manifest.scripts, "foreign package contains install scripts");
      const bytes = entries.get(`bin/${otherFilename}`);
      check(manifest.name === `@align-dotenv/${other}` && manifest.os[0] === other.split("-")[0] && manifest.cpu[0] === "x64", "foreign selectors mismatch");
      check(metadata.version === manifest.version && metadata.version === JSON.parse(await fs.readFile(join(staging, "main/package.json"))).version, "foreign version mismatch");
      check(metadata.commit === execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), "foreign source mismatch");
      check(metadata.bytes === bytes.length && metadata.sha256 === createHash("sha256").update(bytes).digest("hex"), "foreign integrity mismatch");
      for (const content of entries.values()) {
        for (const marker of [root, homedir(), "private-value", "example-secret", "local-value"]) check(!content.toString("utf8").includes(marker), "foreign packed path/value leak");
        check(!/npm_[A-Za-z0-9]{36,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(content.toString("utf8")), "foreign credential-like content");
      }
      const path = join(temporary, `align-dotenv-${other}-${manifest.version}.tgz`);
      await fs.copyFile(otherTarball, path); paths.push(path);
      await fs.copyFile(path, join(staging, "tarballs", `align-dotenv-${other}-${manifest.version}.tgz`));
    });
    check(paths.length === 3, "tarball inspection failed; consumer scenarios cannot run");
    // npm 11 needs metadata for both optional dependencies in a reproducible
    // offline lockfile, even though the incompatible package is never installed.
    await fs.writeFile(join(consumer, "package.json"), JSON.stringify({ name: "offline-consumer", private: true, scripts: { align: "align-dotenv" },
      overrides: { [`@align-dotenv/${target}`]: `file:${paths[1].replaceAll("\\", "/")}`, [`@align-dotenv/${other}`]: `file:${paths[2].replaceAll("\\", "/")}` } }));
    await t.test("normal registry install selects optional OS/CPU package; cached lockfile ci is offline", async () => {
      const directory = join(temporary, "local registry consumer"); await fs.mkdir(directory);
      const registryNpm = (args) => npm(directory, ["--cache", join(temporary, "registry-cache"), ...args]);
      await fs.writeFile(join(directory, "package.json"), '{"private":true}');
      const main = JSON.parse(await fs.readFile(join(staging, "main/package.json"), "utf8"));
      const platform = JSON.parse(await fs.readFile(join(staging, target, "package.json"), "utf8"));
      const other = target === "linux-x64" ? "win32-x64" : "linux-x64";
      const opposite = JSON.parse(await fs.readFile(join(root, "node/npm/platforms", other, "package.json"), "utf8"));
      let forbiddenFetch = false, url;
      const server = createServer((request, response) => {
        const path = decodeURIComponent(request.url.split("?")[0]);
        if (path === "/main.tgz" || path === "/native.tgz") {
          fs.readFile(path === "/main.tgz" ? paths[0] : paths[1]).then((bytes) => { response.end(bytes); }, () => { response.statusCode = 500; response.end(); });
          return;
        }
        if (path === "/incompatible.tgz") forbiddenFetch = true;
        const manifest = [main, platform, opposite].find((item) => path === `/${item.name}`);
        if (!manifest) { response.statusCode = 404; response.end(); return; }
        const filename = manifest === main ? "main.tgz" : manifest === platform ? "native.tgz" : "incompatible.tgz";
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ name: manifest.name, "dist-tags": { latest: manifest.version },
          versions: { [manifest.version]: { ...manifest, dist: { tarball: `${url}/${filename}` } } } }));
      });
      await new Promise((done) => server.listen(0, "127.0.0.1", done));
      url = `http://127.0.0.1:${server.address().port}`;
      try {
        const result = await registryNpm(["install", "--offline=false", "--registry", url, "--save-dev", `align-dotenv@${main.version}`]);
        check(result.code === 0 && !forbiddenFetch, "npm optional platform selection failed");
        await fs.access(join(directory, "node_modules/@align-dotenv", target));
        check(!(await fs.readdir(join(directory, "node_modules/@align-dotenv"))).includes(other), "incompatible package installed");
      } finally { await new Promise((done) => server.close(done)); }
      await fs.rm(join(directory, "node_modules"), { recursive: true, force: true });
      check((await registryNpm(["ci", "--offline"])).code === 0, "registry lockfile offline ci failed");
      const result = await registryNpm(["exec", "--offline", "--no", "--", "align-dotenv", "--help"]);
      check(result.code === 0, "normal-registry installed wrapper failed");
    });
    let consumerReady = false;
    await t.test("offline normal install, lockfile, clean npm ci and no-Python tools", async () => {
      for (const command of ["python", "python3", "py"]) {
        const found = await new Promise((done) => {
          const child = spawn(command, ["--version"], { cwd: consumer, env, shell: false });
          child.on("error", () => done(false)); child.on("exit", () => done(true));
        });
        check(!found, "Python unexpectedly accessible on consumer PATH");
      }
      check((await npm(consumer, ["install", "--save-dev", paths[0]])).code === 0, "offline packed installation failed");
      const lock = JSON.parse(await fs.readFile(join(consumer, "package-lock.json"), "utf8"));
      check(lock.packages[`node_modules/@align-dotenv/${target}`]?.version, "platform missing from lockfile");
      check(lock.packages[`node_modules/@align-dotenv/${other}`]?.version, "foreign metadata missing from offline lockfile");
      await fs.rm(join(consumer, "node_modules"), { recursive: true, force: true });
      npmOk(await npm(consumer, ["ci"]), "offline npm ci failed");
      check(!(await fs.readdir(join(consumer, "node_modules/@align-dotenv"))).includes(other), "offline ci installed incompatible platform");
      check(!(await fs.lstat(join(consumer, "node_modules/align-dotenv"))).isSymbolicLink(), "package must not link to checkout");
      check((await fs.readdir(join(consumer, "node_modules/align-dotenv"))).sort().join() === ["LICENSE", "bin", "package.json"].sort().join(), "source present in consumer");
      consumerReady = true;
    });
    check(consumerReady, "consumer setup failed; dependent scenarios cannot run");
    const script = (args = []) => npm(consumer, ["--silent", "run", "align", "--", ...args]);
    const wrapper = (args = []) => run(node, [join(consumer, "node_modules/align-dotenv/bin/align-dotenv.js"), ...args], consumer, env);
    const put = async (local, template = "# Heading\nKEY=default\n") => {
      await fs.writeFile(join(consumer, ".env"), local);
      await fs.writeFile(join(consumer, ".env.example"), template);
    };
    const safe = (result) => {
      for (const marker of ["private-value", "example-secret", "local-value"]) check(!(result.stdout + result.stderr).includes(marker), "diagnostic value leak");
      check(!/Traceback|\n\s+at |file:\/\//.test(result.stdout + result.stderr), "diagnostic stack/path leak");
    };
    await t.test("real npx, npm exec, npm script and Windows generated .cmd shim", async () => {
      const help = await run(standalone, ["--help"], consumer, env);
      for (const result of [await run(node, [npxCli, "align-dotenv", "--help"], consumer, env),
        await npm(consumer, ["exec", "--offline", "--no", "--", "align-dotenv", "--help"]), await script(["--help"])]) {
        check(JSON.stringify(result) === JSON.stringify(help), "npm invocation help mismatch");
      }
      await put("KEY=private-value\n");
      const checked = await run(node, [npxCli, "align-dotenv", "--check"], consumer, env);
      check(checked.code === 1, "npx check exit not preserved"); safe(checked);
      const shim = join(consumer, "node_modules/.bin", process.platform === "win32" ? "align-dotenv.cmd" : "align-dotenv");
      await fs.access(shim);
      if (process.platform === "win32") {
        check((await fs.readFile(shim, "utf8")).includes("align-dotenv.js"), "wrong Windows shim");
        // Only a fixed, test-owned command goes through cmd.exe, never user argv in the launcher.
        const result = await run(process.env.ComSpec, ["/d", "/s", "/c", `""${shim}" --help"`], consumer, env);
        check(JSON.stringify(result) === JSON.stringify(help), "actual Windows .cmd invocation failed");
      } else {
        check(JSON.stringify(await run(shim, ["--help"], consumer, env)) === JSON.stringify(help), "shell shim failed");
      }
    });
    const engines = [
      // Fix only argv[0] so argparse usage names match the installed command.
      (args) => run(python, ["-c", "import sys; from align_dotenv.cli import main; sys.argv[0] = sys.argv.pop(1); sys.exit(main())", filename, ...args], consumer, { ...process.env, PYTHONPATH: join(root, "src"), PYTHONUTF8: "1" }),
      (args) => run(standalone, args, consumer, env), wrapper,
    ];
    await t.test("three-way help and argument parsing", async () => {
      const help = [];
      for (const engine of engines) {
        const result = await engine(["--help"]);
        check(result.code === 0 && result.stderr === "", "help failed");
        for (const option of ["--template", "--unknown", "--check", "target"]) check(result.stdout.includes(option), "help option missing");
        help.push(result.stdout.replaceAll("align-dotenv.exe", "align-dotenv"));
      }
      check(help[0] === help[1] && help[1] === help[2], "canonical help mismatch");
      for (const args of [["--unknown", "bad"], ["--template"], ["--unexpected"], ["a", "b"], [".env"]]) {
        for (const engine of engines) {
          const result = await engine(args);
          check(result.code === 2 && result.stdout === "" && result.stderr.includes("usage:"), "argument error semantics mismatch");
        }
      }
    });
    async function compare(setup, args, expectedCode, expectedBytes) {
      const results = [];
      for (const engine of engines) {
        await setup();
        const before = await fingerprint(join(consumer, ".env"));
        const result = await engine(args); safe(result);
        const after = await fingerprint(join(consumer, ".env"));
        check(result.code === expectedCode, "differential exit mismatch");
        const bytes = await fs.readFile(join(consumer, ".env"));
        check(bytes.equals(Buffer.from(expectedBytes)), "differential bytes mismatch");
        if (args.includes("--check") || expectedCode === 2 || result.stdout.includes("already aligned")) check(before === after, "no-write contract violated");
        results.push(result);
      }
      for (const result of results.slice(1)) check(JSON.stringify(result) === JSON.stringify(results[0]), "differential stdout/stderr mismatch");
    }
    await t.test("three-way all reconciliation fixtures: exact bytes, check/no-write and CLI output", async () => {
      for (const item of loadCases("reconciliation")) {
        const local = inputBytes(item, "local"), template = inputBytes(item, "template");
        const setup = () => put(local, template);
        const args = [".env", "--template", ".env.example", "--unknown", item.unknown];
        await compare(setup, [...args, "--check"], local.equals(Buffer.from(item.expected)) ? 0 : 1, local);
        await compare(setup, args, 0, item.expected);
      }
    });
    await t.test("three-way invalid fixtures: UTF-8, syntax and unknown errors remain safe", async () => {
      for (const item of loadCases("invalid")) {
        const local = inputBytes(item, "local"), template = inputBytes(item, "template");
        for (const policy of item.policies) {
          const args = [".env", "--template", ".env.example", "--unknown", policy];
          await compare(() => put(local, template), args, 2, local);
          await compare(() => put(local, template), [...args, "--check"], 2, local);
        }
      }
    });
    await t.test("three-way project and late preflight with no earlier writes", async () => {
      const nested = join(consumer, "nested folder"); await fs.mkdir(nested);
      const setup = async (bad = false) => {
        await put("KEY=private-value\n");
        await fs.writeFile(join(nested, ".env"), bad ? "source example-secret\n" : "KEY=local-value\n");
        await fs.writeFile(join(nested, ".env.example"), "# Heading\nKEY=default\n");
      };
      await compare(setup, ["--check"], 1, "KEY=private-value\n");
      await compare(setup, [], 0, "# Heading\nKEY=private-value\n");
      await compare(() => setup(true), [], 2, "KEY=private-value\n");
      await fs.rm(nested, { recursive: true, force: true });
      for (const policy of ["keep", "remove", "error"]) {
        const setupUnknown = () => put("KEY=private-value\nEXTRA=example-secret\n", "KEY=default\n");
        const expected = policy === "keep" ? "KEY=private-value\n\nEXTRA=example-secret\n" : policy === "remove" ? "KEY=private-value\n" : "KEY=private-value\nEXTRA=example-secret\n";
        await compare(setupUnknown, ["--unknown", policy], policy === "error" ? 2 : 0, expected);
      }
      await put("KEY=private-value\n");
      check((await script()).code === 0 && (await script(["--check"])).code === 0, "npm-script project flow failed");
    });
    await t.test("installed wrapper links, native mode, no-rewrite, arbitrary cwd and argument transport", async () => {
      const args = [".env", "--template", ".env.example"];
      await put("KEY=private-value\n");
      const file = join(consumer, ".env"), template = join(consumer, ".env.example");
      const mode = (await fs.stat(file)).mode;
      check((await script(args)).code === 0 && (await fs.stat(file)).mode === mode, "native mode changed");
      const before = await fingerprint(file);
      check((await wrapper(args)).code === 0 && before === await fingerprint(file), "unchanged file rewritten");
      await fs.unlink(template); await fs.link(file, template);
      check((await wrapper(args)).code === 2 && before === await fingerprint(file), "hard-link same-file not rejected");
      await fs.unlink(template); await fs.writeFile(template, "KEY=default\n");
      check((await wrapper([".env", "--template", ".env"])).code === 2, "same path accepted");
      const referent = join(consumer, "referent"); await fs.rename(file, referent); await fs.symlink(referent, file, "file");
      check((await wrapper(args)).code === 2 && (await fs.lstat(file)).isSymbolicLink(), "target symlink accepted");
      await fs.unlink(file); await fs.rename(referent, file);
      const spaced = join(consumer, "target with spaces"); await fs.rename(file, spaced);
      const result = await npm(temporary, ["--prefix", consumer, "--silent", "run", "align", "--", spaced, "--template", template]);
      check(result.code === 0, "absolute space paths/arbitrary cwd failed");
      await fs.rename(spaced, file);
      for (const argv of [["--unknown", "bad"], ["--template"], ["--unexpected"], ["a", "b"], ["--unknown", "keep;echo example-secret"]]) {
        const expected = await run(standalone, argv, consumer, env), actual = await wrapper(argv);
        check(JSON.stringify(actual) === JSON.stringify(expected) && actual.code === 2, "argument transport mismatch");
      }
      check(!(await fs.readdir(consumer)).some((name) => name.startsWith(".align-dotenv-")), "temporary artifact leaked");
    });
    await t.test("installed wrapper replacement failure preserves original and cleans temporary", async () => {
      await put("KEY=private-value\n");
      const file = join(consumer, ".env");
      const before = await fingerprint(file);
      let locker;
      if (process.platform === "win32") {
        const code = "import ctypes,sys; k=ctypes.WinDLL('kernel32',use_last_error=True); k.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]; k.CreateFileW.restype=ctypes.c_void_p; h=k.CreateFileW(sys.argv[1],0x80000000,1,None,3,0,None); assert h not in (None,ctypes.c_void_p(-1).value); print('ready',flush=True); sys.stdin.readline(); k.CloseHandle.argtypes=[ctypes.c_void_p]; k.CloseHandle(h)";
        locker = spawn(python, ["-c", code, file], { cwd: consumer, env: process.env, shell: false });
        await new Promise((done, reject) => {
          locker.stdout.once("data", (data) => data.toString().trim() === "ready" ? done() : reject(new Error("lock handshake failed")));
          locker.once("error", () => reject(new Error("lock setup failed")));
          locker.once("exit", () => reject(new Error("lock setup exited early")));
        });
      } else {
        await fs.chmod(consumer, 0o500);
      }
      try {
        const result = await wrapper([".env", "--template", ".env.example"]); safe(result);
        check(result.code === 2 && result.stderr === "align-dotenv: cannot read or update files; check paths and permissions.\n", "replacement failure diagnostic mismatch");
        check(before === await fingerprint(file), "replacement failure altered original");
        check(!(await fs.readdir(consumer)).some((name) => name.startsWith(".align-dotenv-")), "replacement failure leaked temporary");
      } finally {
        if (locker) {
          const closed = new Promise((done) => locker.once("exit", done));
          locker.stdin.end("release\n"); await closed;
        } else { await fs.chmod(consumer, 0o700); }
      }
    });
    await t.test("omitted platform and missing executable fail safely with exit 2", async () => {
      const omittedConsumer = join(temporary, "omitted optional consumer");
      await fs.mkdir(omittedConsumer);
      await fs.writeFile(join(omittedConsumer, "package.json"), '{"private":true}');
      check((await npm(omittedConsumer, ["install", "--omit=optional", paths[0]])).code === 0, "optional-omitted install failed");
      const missing = await npm(omittedConsumer, ["exec", "--offline", "--no", "--", "align-dotenv", "--help"]);
      check(missing.code === 2 && missing.stderr.includes("optional dependencies enabled"), "actual omitted optional dependency not diagnosed");
      const installed = join(consumer, "node_modules/@align-dotenv", target);
      await fs.rename(installed, installed + "-saved");
      const omitted = await wrapper(["--help"]);
      check(omitted.code === 2 && omitted.stdout === "" && omitted.stderr.includes("optional dependencies enabled"), "missing package error unsafe");
      check(!omitted.stderr.includes(consumer), "launcher leaks consumer path");
      await fs.rename(installed + "-saved", installed);
      if (process.platform === "linux") {
        const binary = join(installed, "bin", filename);
        await fs.chmod(binary, 0o644);
        const denied = await wrapper();
        check(denied.code === 2 && denied.stderr.includes("executable permissions") && !denied.stderr.includes(consumer), "real permission error unsafe");
        await fs.chmod(binary, 0o755);
      }
      await fs.unlink(join(installed, "bin", filename));
      check((await wrapper()).code === 2, "missing binary did not fail safely");
    });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
