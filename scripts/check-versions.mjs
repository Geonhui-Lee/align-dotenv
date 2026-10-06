/** Dependency-free joint-distribution version gate for CI and release workflows. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
class VersionValidationError extends Error {}

export function checkVersions(root = ROOT, tag) {
  try {
    const python = readFileSync(join(root, "pyproject.toml"), "utf8");
    // Only the controlled [project] section, not similarly named URL/tool sections.
    const section = python.match(/^\[project\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
    const version = section?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
    const manifest = JSON.parse(readFileSync(join(root, "node/package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(join(root, "node/package-lock.json"), "utf8"));
    if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new VersionValidationError("pyproject.toml must contain a stable X.Y.Z project version");
    }
    if (version !== manifest.version) {
      throw new VersionValidationError("pyproject.toml and node/package.json versions differ");
    }
    if (version !== lock.version || version !== lock.packages?.[""]?.version ||
        manifest.name !== lock.name || manifest.name !== lock.packages?.[""]?.name) {
      throw new VersionValidationError("node/package-lock.json identity/version differs from node/package.json");
    }
    {
      const main = JSON.parse(readFileSync(join(root, "node/npm/package.json"), "utf8"));
      if (main.name !== "align-dotenv" || main.version !== version) {
        throw new VersionValidationError("npm launcher version/identity differs from Python");
      }
      for (const target of ["linux-x64", "win32-x64"]) {
        const platform = JSON.parse(readFileSync(join(root, "node/npm/platforms", target, "package.json"), "utf8"));
        if (platform.name !== `@align-dotenv/${target}` || platform.version !== version || main.optionalDependencies?.[platform.name] !== version) {
          throw new VersionValidationError("npm platform package versions must match Python and exact optional dependencies");
        }
      }
    }
    if (tag !== undefined && tag !== `v${version}`) {
      throw new VersionValidationError("release tag must equal v plus the synchronized Python/npm version");
    }
    return version;
  } catch (error) {
    if (error instanceof VersionValidationError) throw error;
    throw new VersionValidationError("cannot read version metadata");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === "--tag") &&
        !(args.length === 1 && args[0] === "--release")) {
      throw new VersionValidationError("usage: node scripts/check-versions.mjs [--tag vX.Y.Z | --release]");
    }
    const tag = args[0] === "--release" ? process.env.RELEASE_TAG : args[1];
    if (args[0] === "--release" && !tag) throw new VersionValidationError("RELEASE_TAG is required in release mode");
    console.log(`Synchronized Python/npm version: ${checkVersions(ROOT, tag)}`);
  } catch (error) {
    console.error(`Version check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
