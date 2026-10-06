#!/usr/bin/env node
/** Transport only. Dotenv semantics belong exclusively to the executable. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { constants } from "node:os";

const require = createRequire(import.meta.url);
const fail = (message) => {
  console.error(`align-dotenv: ${message}`);
  process.exitCode = 2;
};
const targets = { "linux-x64": "align-dotenv", "win32-x64": "align-dotenv.exe" };
const target = `${process.platform}-${process.arch}`;
if (!Object.hasOwn(targets, target)) {
  fail("unsupported platform; supported targets are Linux x64 and Windows x64.");
} else {
  let executable;
  try {
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const metadata = JSON.parse(readFileSync(require.resolve(`@align-dotenv/${target}/package.json`), "utf8"));
    if (metadata.version !== own.version) throw new Error();
    executable = require.resolve(`@align-dotenv/${target}/bin/${targets[target]}`);
  } catch {
    fail("compatible executable package missing or mismatched; reinstall with optional dependencies enabled.");
  }
  if (executable) {
    const child = spawn(executable, process.argv.slice(2), { shell: false, stdio: "inherit", windowsHide: true });
    const signals = ["SIGINT", "SIGTERM"];
    const forward = (signal) => { if (!child.killed) child.kill(signal); };
    const handlers = signals.map((signal) => {
      const handler = () => forward(signal);
      process.on(signal, handler);
      return [signal, handler];
    });
    const cleanup = () => { for (const [signal, handler] of handlers) process.off(signal, handler); };
    child.on("error", () => {
      cleanup();
      fail("cannot start packaged executable; check installation and executable permissions.");
    });
    child.on("exit", (code, signal) => {
      cleanup();
      if (signal && process.platform !== "win32") {
        process.kill(process.pid, signal);
      } else {
        process.exitCode = code ?? (128 + (constants.signals[signal] ?? 1));
      }
    });
  }
}
