/** Transport unit tests use synthetic children; native CI separately proves real binaries. */
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { check } from "./helpers.mjs";

const source = await fs.readFile(new URL("../npm/bin/align-dotenv.js", import.meta.url), "utf8");

test("launcher: unsupported/missing/mismatched packages are safe; POSIX transport and signals", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "align-launcher-unit-"));
  try {
    await fs.mkdir(join(root, "bin"));
    await fs.writeFile(join(root, "package.json"), JSON.stringify({ type: "module", version: "0.3.1" }));
    const script = join(root, "bin/align-dotenv.js");
    const write = (target) => fs.writeFile(script, source.replace('`${process.platform}-${process.arch}`', JSON.stringify(target)));
    const run = (args = [], input = "") => new Promise((done, reject) => {
      const child = spawn(process.execPath, [script, ...args], { cwd: root, shell: false });
      let stdout = "", stderr = "";
      child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; });
      child.on("error", reject); child.on("close", (code, signal) => done({ code, signal, stdout, stderr }));
      child.stdin.end(input);
    });
    await write("darwin-x64");
    check((await run()).stderr === "align-dotenv: unsupported platform; supported targets are Linux x64 and Windows x64.\n", "unsupported diagnostic mismatch");
    await write("linux-arm64"); check((await run()).code === 2, "unsupported architecture accepted");
    await write("linux-x64");
    let result = await run();
    check(result.code === 2 && !result.stderr.includes(root) && result.stdout === "", "missing package unsafe");
    const pkg = join(root, "node_modules/@align-dotenv/linux-x64");
    await fs.mkdir(join(pkg, "bin"), { recursive: true });
    await fs.writeFile(join(pkg, "package.json"), JSON.stringify({ version: "9.9.9" }));
    check((await run()).code === 2, "mismatched version accepted");
    await fs.writeFile(join(pkg, "package.json"), JSON.stringify({ version: "0.3.1" }));
    if (process.platform !== "win32") {
      const binary = join(pkg, "bin/align-dotenv");
      // Absolute node path avoids any synthetic child reliance on PATH.
      await fs.writeFile(binary, `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='signal'){process.kill(process.pid,'SIGTERM');}else{let data='';process.stdin.on('data',v=>data+=v);process.stdin.on('end',()=>{console.log(JSON.stringify(args));process.stderr.write(data);process.exitCode=Number(args[0]);});}\n`, { mode: 0o755 });
      for (const code of [0, 1, 2, 7]) {
        const args = [String(code), "space path", "$(echo injected)", ";touch nope", '"quoted"', "Unicode-한글"];
        result = await run(args, "stdin transport\n");
        check(result.code === code && result.stdout === JSON.stringify(args) + "\n" && result.stderr === "stdin transport\n", "transport mismatch");
      }
      result = await run(["signal"]); check(result.signal === "SIGTERM", "child signal not preserved");
      await fs.chmod(binary, 0o644);
      result = await run(); check(result.code === 2 && !result.stderr.includes(root) && result.stderr.includes("permissions"), "permission error unsafe");
    } else {
      t.diagnostic("POSIX synthetic executable/signal unit cases are Linux-only; real Windows executable and .cmd gate is separate.");
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
