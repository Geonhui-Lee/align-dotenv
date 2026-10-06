/** Stage explicit-allowlist npm distributions from a same-commit native build. */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkVersions } from "./check-versions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw new Error();
  const version = checkVersions();
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  // A stale build cannot be presented as current-source evidence.
  if (execFileSync("git", ["diff", "HEAD", "--", "src/align_dotenv", "pyproject.toml", "node/npm", "scripts/build-executable.py", "scripts/pack-npm.mjs", "scripts/check-versions.mjs"], { cwd: root }).length) throw new Error();
  const metadata = JSON.parse(await fs.readFile(join(resolve(input), "metadata.json"), "utf8"));
  const target = metadata.os === "Linux" ? "linux-x64" : metadata.os === "Windows" ? "win32-x64" : "";
  if (!target || metadata.architecture !== "x64" || metadata.version !== version || metadata.commit !== commit) throw new Error();
  const sourceName = `align-dotenv-v${version}-${target === "linux-x64" ? "linux-x64" : "windows-x64.exe"}`;
  if (metadata.filename !== sourceName || !metadata.python || !metadata.pyinstaller) throw new Error();
  const binary = await fs.readFile(join(resolve(input), sourceName));
  if (binary.length !== metadata.bytes || createHash("sha256").update(binary).digest("hex") !== metadata.sha256) throw new Error();
  if (target === "linux-x64") {
    if (!binary.subarray(0, 5).equals(Buffer.from([127, 69, 76, 70, 2])) || binary.readUInt16LE(18) !== 62) throw new Error();
  } else {
    const offset = binary.readUInt32LE(60);
    if (binary.toString("ascii", 0, 2) !== "MZ" || binary.toString("ascii", offset, offset + 4) !== "PE\0\0" || binary.readUInt16LE(offset + 4) !== 0x8664) throw new Error();
  }
  const destination = resolve(output);
  // Refuse to mix stale files into a tarball; caller supplies a fresh directory.
  await fs.mkdir(destination);
  const main = join(destination, "main"), platform = join(destination, target);
  for (const directory of [main, platform]) {
    await fs.mkdir(join(directory, "bin"), { recursive: true });
    await fs.copyFile(join(root, "LICENSE"), join(directory, "LICENSE"));
  }
  const mainManifest = JSON.parse(await fs.readFile(join(root, "node/npm/package.json"), "utf8"));
  await fs.writeFile(join(main, "package.json"), JSON.stringify({ ...mainManifest,
    alignDotenvBuild: { version, sourceCommit: commit } }, null, 2) + "\n");
  await fs.copyFile(join(root, "node/npm/bin/align-dotenv.js"), join(main, "bin/align-dotenv.js"));
  await fs.chmod(join(main, "bin/align-dotenv.js"), 0o755);
  await fs.copyFile(join(root, "node/npm/platforms", target, "package.json"), join(platform, "package.json"));
  const filename = target === "linux-x64" ? "align-dotenv" : "align-dotenv.exe";
  await fs.writeFile(join(platform, "bin", filename), binary, { mode: 0o755 });
  await fs.writeFile(join(platform, "metadata.json"), JSON.stringify({ ...metadata, sourceFilename: sourceName, filename: `bin/${filename}` }, null, 2) + "\n");
  console.log(`Staged align-dotenv ${version}, ${target}, source ${commit}; ${binary.length} bytes, SHA-256 ${metadata.sha256}`);
} catch {
  console.error("npm staging failed: require a fresh output directory and a verified same-version, same-commit x64 build (details withheld).");
  process.exitCode = 1;
}
