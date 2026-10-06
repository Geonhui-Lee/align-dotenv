/** Release gate: inspect a real npm tarball and execute installed npm shims. */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, posix } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { check, loadCases, inputBytes } from "../test/helpers.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;

async function npm(cwd, args) {
  check(typeof npmCli === "string" && npmCli.endsWith(".js"), "run package tests through npm run test:package");
  return await new Promise((resolve, reject) => {
    // Execute npm's JS entry directly: npm.cmd cannot safely be execFile'd on Windows.
    // npm itself runs the installed consumer .bin shim; never run dist/bin.js here.
    const env = { ...process.env, npm_config_update_notifier: "false" };
    // Version-selection launchers such as `npm exec --package=node@22` must not
    // turn the consumer's offline npm exec into an unrelated package request.
    delete env.npm_config_package;
    delete env.npm_config_call;
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd, windowsHide: true, timeout: 120000,
      env,
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text) => { stdout += text; });
    child.stderr.on("data", (text) => { stderr += text; });
    child.on("error", () => reject(new Error("npm subprocess failed (output withheld)")));
    child.on("close", (code, signal) => {
      if (signal) { reject(new Error("npm subprocess terminated unexpectedly (output withheld)")); return; }
      resolve({ code, stdout: stdout.replaceAll("\r\n", "\n"), stderr: stderr.replaceAll("\r\n", "\n") });
    });
  });
}

// A small read-only ustar inspector, not an extraction utility. npm's short
// allowlisted names do not need PAX/GNU extensions; reject unfamiliar entry types.
function tarEntries(archive) {
  const bytes = gunzipSync(archive), entries = new Map();
  const text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const prefix = text(header.subarray(345, 500));
    const name = (prefix ? prefix + "/" : "") + text(header.subarray(0, 100));
    const size = parseInt(text(header.subarray(124, 136)).trim(), 8);
    const mode = parseInt(text(header.subarray(100, 108)).trim(), 8);
    check(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= bytes.length, "malformed tar entry size");
    const kind = header[156];
    check(kind === 0 || kind === 48 || kind === 53, "unexpected tar entry type");
    check(name.startsWith("package/") && !name.split("/").includes(".."), "unsafe tar entry path");
    if (kind !== 53) {
      check(!entries.has(name), "duplicate tar entry");
      entries.set(name, { bytes: bytes.subarray(offset + 512, offset + 512 + size), mode });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function resultMatches(result, code, stdout, stderr = "") {
  check(result.code === code, "installed CLI exit mismatch");
  check(result.stdout === stdout && result.stderr === stderr, "installed CLI output mismatch");
  const output = result.stdout + result.stderr;
  for (const marker of ["private-value", "example-secret", "local-value"]) check(!output.includes(marker), "installed CLI value leak");
  check(!/\n\s+at |Traceback|file:\/\//.test(output), "installed CLI stack trace");
}

test("packed package: artifact and fresh-consumer npm-bin release gate", { timeout: 240000 }, async (t) => {
  // Every recursive cleanup below is confined to this owned temporary directory.
  const temporary = await fs.mkdtemp(join(tmpdir(), "align-dotenv-package-"));
  try {
    const packed = await npm(packageRoot, ["pack", "--json", "--pack-destination", temporary]);
    check(packed.code === 0, "npm pack failed (output withheld)");
    const [report] = JSON.parse(packed.stdout);
    const archive = join(temporary, report.filename);
    const entries = tarEntries(await fs.readFile(archive));
    const consumer = join(temporary, "consumer with spaces");
    await fs.mkdir(consumer);
    await fs.writeFile(join(consumer, "package.json"), JSON.stringify({
      name: "align-dotenv-packed-consumer", private: true,
      scripts: { align: "align-dotenv" },
    }));
    const installed = await npm(consumer, ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", archive]);
    check(installed.code === 0, "fresh tarball installation failed (output withheld)");
    const installedRoot = join(consumer, "node_modules", "align-dotenv");
    const run = (argv = []) => npm(consumer, ["--silent", "run", "align", "--", ...argv]);
    const target = join(consumer, ".env"), template = join(consumer, ".env.example");
    const put = async (local = "KEY=private-value\n", sample = "# Heading\nKEY=default\r\n") => {
      await fs.writeFile(target, local); await fs.writeFile(template, sample);
    };
    const bytesMatch = async (path, content) => check((await fs.readFile(path)).equals(Buffer.from(content)), "installed CLI file-byte mismatch");

    await t.test("tar allowlist, license, metadata, synchronized version and secret/import audit", async () => {
      const modules = ["bin", "cli", "files", "parser", "project", "reconcile", "internal/file-operations"];
      const expected = ["LICENSE", "README.md", "package.json",
        ...modules.flatMap((name) => [`dist/${name}.js`, `dist/${name}.d.ts`])].sort();
      check(JSON.stringify([...entries.keys()].map((path) => path.slice(8)).sort()) === JSON.stringify(expected), "tarball file allowlist mismatch");
      check(JSON.stringify(report.files.map((entry) => entry.path).sort()) === JSON.stringify(expected), "pack report/tar file list mismatch");
      const rootLicense = await fs.readFile(new URL("../../LICENSE", import.meta.url));
      check(entries.get("package/LICENSE").bytes.equals(rootLicense), "packed license differs from root MIT license");
      const metadata = JSON.parse(entries.get("package/package.json").bytes);
      const lock = JSON.parse(await fs.readFile(join(packageRoot, "package-lock.json"), "utf8"));
      const python = await fs.readFile(new URL("../../pyproject.toml", import.meta.url), "utf8");
      check(metadata.version === python.match(/\[project\][\s\S]*?\nversion = "([^"]+)"/)[1], "Python/npm versions diverged");
      check(lock.name === metadata.name && lock.version === metadata.version &&
        lock.packages[""].version === metadata.version, "npm manifest/lockfile versions diverged");
      check(metadata.name === "align-dotenv" && metadata.private === true && metadata.license === "MIT", "packed package identity/protection mismatch");
      check(metadata.bin["align-dotenv"] === "./dist/bin.js" && metadata.engines.node === ">=22", "packed bin/engine mismatch");
      check(!metadata.os && !metadata.dependencies && !metadata.optionalDependencies, "unwanted OS restriction or runtime dependencies");
      const bin = entries.get("package/dist/bin.js");
      check(bin.bytes.toString().startsWith("#!/usr/bin/env node\n"), "packed bin has no shebang");
      for (const [name, entry] of entries) {
        const content = entry.bytes.toString("utf8");
        for (const marker of ["private-value", "example-secret", "local-value", packageRoot, homedir()]) {
          check(!content.includes(marker), "tarball contains local path or test payload");
        }
        check(!/npm_[A-Za-z0-9]{36,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(content), "tarball contains credential-like content");
        if (name.endsWith(".js")) {
          for (const match of content.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)) {
            const specifier = match[1];
            check(specifier.startsWith("node:") || (specifier.startsWith(".") &&
              specifier.endsWith(".js") && entries.has(posix.join(posix.dirname(name), specifier))), "packed runtime import escapes artifact");
          }
        }
      }
      console.log(`Packed artifact: ${report.entryCount} files, ${report.size} compressed bytes, ${report.unpackedSize} unpacked bytes.`);
    });

    await t.test("installed package is independent and npm created the command shim", async () => {
      check(!(await fs.lstat(installedRoot)).isSymbolicLink(), "consumer uses a source link instead of installed tarball");
      const listing = (await fs.readdir(installedRoot)).sort();
      check(JSON.stringify(listing) === JSON.stringify(["LICENSE", "README.md", "dist", "package.json"]), "installed package includes development-only files");
      const shim = join(consumer, "node_modules", ".bin", process.platform === "win32" ? "align-dotenv.cmd" : "align-dotenv");
      await fs.access(shim);
      if (process.platform === "win32") {
        check((await fs.readFile(shim, "utf8")).includes("bin.js"), "Windows npm shim does not point to compiled bin");
      } else {
        check((await fs.stat(join(installedRoot, "dist/bin.js"))).mode & 0o111, "installed bin is not executable");
      }
      check((await fs.readdir(join(consumer, "node_modules"))).filter((name) => !name.startsWith(".")).length === 1,
        "consumer installed runtime dependencies");
    });

    await t.test("npm exec/npx-equivalent help invokes the installed shim offline", async () => {
      const help = await npm(consumer, ["exec", "--offline", "--no", "--", "align-dotenv", "--help"]);
      check(help.code === 0 && help.stderr === "" && help.stdout.includes("usage: align-dotenv"), "installed npx help failed");
    });

    await t.test("explicit check/update/aligned via consumer npm script", async () => {
      await put();
      resultMatches(await run([".env", "--template", ".env.example", "--check"]), 1, "Target is not aligned.\n");
      await bytesMatch(target, "KEY=private-value\n");
      resultMatches(await run([".env", "--template", ".env.example"]), 0, "Updated target.\n");
      await bytesMatch(target, "# Heading\nKEY=private-value\r\n");
      resultMatches(await run([".env", "--template", ".env.example", "--check"]), 0, "Target is aligned.\n");
      resultMatches(await run([".env", "--template", ".env.example"]), 0, "Target already aligned.\n");
    });

    await t.test("installed unknown keep/remove/error and safe syntax/UTF-8 errors", async () => {
      const args = [".env", "--template", ".env.example"];
      await put("KEY=private-value\nEXTRA=example-secret\n", "KEY=default\n");
      resultMatches(await run([...args, "--unknown", "error"]), 2, "", "align-dotenv: unknown local keys: EXTRA\n");
      await bytesMatch(target, "KEY=private-value\nEXTRA=example-secret\n");
      resultMatches(await run([...args, "--unknown", "keep"]), 0, "Updated target.\n");
      await bytesMatch(target, "KEY=private-value\n\nEXTRA=example-secret\n");
      resultMatches(await run([...args, "--unknown", "remove"]), 0, "Updated target.\n");
      await bytesMatch(target, "KEY=private-value\n");
      await put("source example-secret\n");
      resultMatches(await run(args), 2, "", "align-dotenv: unsupported local syntax at lines 1; no changes were made\n");
      await bytesMatch(target, "source example-secret\n");
      await put(Buffer.from([0xff]));
      resultMatches(await run(args), 2, "", "align-dotenv: files must contain UTF-8 text.\n");
    });

    await t.test("project cwd, recursive alignment, checks, grammar and skips", async () => {
      await put();
      const nested = join(consumer, "nested folder"); await fs.mkdir(nested);
      await fs.writeFile(join(nested, ".env.local"), "KEY=local-value\n");
      await fs.writeFile(join(nested, ".env.local.template"), "# Heading\nKEY=default\n");
      await fs.writeFile(join(consumer, ".env.missing.example"), "KEY=default\n");
      const skipped = "Skipped 1 template because its target does not exist.\n";
      resultMatches(await run(["--check"]), 1, "2 dotenv files need alignment.\n" + skipped);
      await bytesMatch(target, "KEY=private-value\n");
      resultMatches(await run(), 0, "Aligned 2 dotenv files.\n" + skipped);
      await bytesMatch(target, "# Heading\nKEY=private-value\r\n");
      await bytesMatch(join(nested, ".env.local"), "# Heading\nKEY=local-value\n");
      resultMatches(await run(["--check"]), 0, "All 2 dotenv files are aligned.\n" + skipped);
      check(!(await fs.readdir(consumer)).includes(".env.missing"), "installed project created missing target");
    });

    await t.test("installed project late preflight failure never writes earlier target", async () => {
      await put();
      const nested = join(consumer, "nested folder");
      await fs.writeFile(join(nested, ".env.local"), "source example-secret\n");
      const label = join("nested folder", ".env.local");
      resultMatches(await run(), 2, "", `align-dotenv: ${label}: unsupported local syntax at lines 1; no changes were made; no files were changed\n`);
      await bytesMatch(target, "KEY=private-value\n");
    });

    await t.test("installed CLI preserves all shared success fixture bytes in check/write mode", async () => {
      // Same canonical fixtures; no packed fixture corpus or duplicated expectations.
      for (const item of loadCases("reconciliation")) {
        const local = inputBytes(item, "local");
        await put(local, inputBytes(item, "template"));
        const args = [".env", "--template", ".env.example", "--unknown", item.unknown];
        const changed = !local.equals(Buffer.from(item.expected));
        resultMatches(await run([...args, "--check"]), changed ? 1 : 0,
          changed ? "Target is not aligned.\n" : "Target is aligned.\n");
        await bytesMatch(target, local);
        resultMatches(await run(args), 0, changed ? "Updated target.\n" : "Target already aligned.\n");
        await bytesMatch(target, item.expected);
      }
    });
  } catch (error) {
    // Boolean assertions are already payload-free; never print subprocess/JSON details.
    if (error?.code === "ERR_ASSERTION") throw error;
    throw new Error("packed validation failed (details withheld)");
  } finally {
    try { await fs.rm(temporary, { recursive: true, force: true }); }
    catch { throw new Error("packed validation cleanup failed (details withheld)"); }
  }
});
