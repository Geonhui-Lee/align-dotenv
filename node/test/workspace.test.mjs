/** Ensure fresh CI cannot silently resurrect the retired compiler/runtime. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { check, loadCases, inputBytes } from "./helpers.mjs";

test("npm validation workspace: private, dependency-free and no native TypeScript", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
  check(manifest.private === true && !manifest.bin && !manifest.files, "workspace must not masquerade as a distribution");
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    check(!manifest[field], "workspace compiler/runtime dependencies remain");
  }
  check(Object.keys(lock.packages).join() === "", "lockfile contains retired development dependencies");
  check(Object.keys(manifest.scripts).sort().join() === "test,test:package", "compiler/prepack scripts remain");
  const paths = execFileSync("git", ["ls-files", "-z", "node"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8",
  }).split("\0").filter(Boolean);
  check(!paths.some((path) => path.startsWith("node/src/") || path.endsWith(".ts") || path.endsWith("tsconfig.json") || path === "node/packaging/packed.test.mjs"), "tracked native reference implementation/tooling remains");
});

test("npm fixture helpers: all shared cases remain runtime-neutral and byte-exact", () => {
  for (const group of ["reconciliation", "invalid"]) {
    for (const item of loadCases(group)) {
      for (const field of ["local", "template"]) {
        const bytes = inputBytes(item, field);
        check(Buffer.isBuffer(bytes), "fixture input is not bytes");
        if (`${field}_hex` in item) check(bytes.toString("hex") === item[`${field}_hex`].toLowerCase(), "hex fixture conversion changed bytes");
        else check(bytes.equals(Buffer.from(item[field], "utf8")), "string fixture conversion changed bytes");
      }
    }
  }
});
