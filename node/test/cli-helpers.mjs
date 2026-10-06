import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check } from "./helpers.mjs";

export const entry = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
export async function runCli(cwd, argv = []) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...argv], { cwd, windowsHide: true, timeout: 20000 });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text) => { stdout += text; });
    child.stderr.on("data", (text) => { stderr += text; });
    child.on("error", () => reject(new Error("CLI spawn failed (payload redacted)")));
    child.on("close", (code, signal) => {
      if (signal) { reject(new Error("CLI terminated unexpectedly (payload redacted)")); return; }
      resolve({ code, stdout: stdout.replaceAll("\r\n", "\n"), stderr: stderr.replaceAll("\r\n", "\n") });
    });
  });
}

export function checkResult(result, code, stdout, stderr = "") {
  check(result.code === code, "CLI exit code mismatch");
  check(result.stdout === stdout, "CLI stdout mismatch");
  check(result.stderr === stderr, "CLI stderr mismatch");
  checkSafe(result);
}

export function checkSafe(result) {
  const output = result.stdout + result.stderr;
  for (const marker of ["private-value", "example-secret", "local-value", "private-secret", "unknown-secret"]) {
    check(!output.includes(marker), "CLI output leaked a value");
  }
  check(!/\n\s+at |Traceback|file:\/\//.test(output), "CLI output contains a stack trace");
}
