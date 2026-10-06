/** CLI orchestration corresponding to Python v0.2.0 cli.py. */
import { EOL } from "node:os";
import { resolve } from "node:path";
import { alignFile, FileIOError, FileValidationError, Utf8DecodingError } from "./files.js";
import { UnsupportedLocalSyntaxError } from "./parser.js";
import { applyProject, planProject, ProjectValidationError } from "./project.js";
import { UnknownKeysError, type UnknownPolicy } from "./reconcile.js";

/** Small output/cwd boundary, not a filesystem dependency-injection interface. */
export interface CliContext {
  readonly cwd?: string;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
}

const USAGE = "usage: align-dotenv [-h] [--template PATH] [--unknown {keep,remove,error}] [--check] [target]";
const HELP = [
  USAGE, "", "Align a local dotenv file with a template.", "",
  "Without target/--template, align existing dotenv files in the current directory recursively.", "",
  "positional arguments:", "  target           existing local dotenv file to update", "",
  "options:", "  -h, --help       show this help message and exit",
  "  --template PATH  template file (required with target)",
  "  --unknown {keep,remove,error}",
  "                   local keys absent from the template (default: keep)",
  "  --check          report misalignment without writing",
].join(EOL) + EOL;

class ArgumentError extends Error {}
interface Arguments {
  target?: string;
  template?: string;
  unknown: UnknownPolicy;
  check: boolean;
  help: boolean;
}

function isOption(text: string): boolean {
  // argparse treats negative numeric paths as positional/option values.
  return text.length > 1 && text.startsWith("-") && !/^-\d+$|^-\d*\.\d+$/.test(text);
}

function parse(argv: readonly string[]): Arguments {
  const result: Arguments = { unknown: "keep", check: false, help: false };
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!positionalOnly && arg === "--") { positionalOnly = true; continue; }
    if (!positionalOnly && isOption(arg)) {
      const equal = arg.indexOf("=");
      const spelling = equal < 0 ? arg : arg.slice(0, equal);
      const matches = spelling.startsWith("--")
        ? ["--template", "--unknown", "--check", "--help"].filter((name) => name.startsWith(spelling))
        : spelling === "-h" ? ["--help"] : [];
      if (matches.length !== 1) throw new ArgumentError("unrecognized or ambiguous option");
      const option = matches[0]!;
      if (option === "--help" || option === "--check") {
        if (equal >= 0) throw new ArgumentError(`${option} does not take a value`);
        if (option === "--help") { result.help = true; return result; }
        result.check = true;
      } else {
        const value = equal >= 0 ? arg.slice(equal + 1) : argv[++index];
        if (value === undefined || (equal < 0 && isOption(value))) {
          throw new ArgumentError(`${option} requires a value`);
        }
        if (option === "--template") result.template = value;
        else {
          if (value !== "keep" && value !== "remove" && value !== "error") {
            throw new ArgumentError("--unknown must be keep, remove, or error");
          }
          result.unknown = value;
        }
      }
    } else {
      if (result.target !== undefined) throw new ArgumentError("only one target may be supplied");
      result.target = arg;
    }
  }
  if ((result.target === undefined) !== (result.template === undefined)) {
    throw new ArgumentError("target and --template must be supplied together");
  }
  return result;
}

function currentDirectory(): string {
  try { return process.cwd(); } catch { throw new FileIOError(); }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  context: CliContext = {},
): Promise<number> {
  const stdout = context.stdout ?? ((text: string) => { process.stdout.write(text); });
  const stderr = context.stderr ?? ((text: string) => { process.stderr.write(text); });
  let args: Arguments;
  try {
    args = parse(argv);
  } catch (error) {
    // Never echo untrusted argument strings, even when they resemble values.
    const message = error instanceof ArgumentError ? error.message : "invalid arguments";
    stderr(`${USAGE}${EOL}align-dotenv: error: ${message}${EOL}`);
    return 2;
  }
  if (args.help) { stdout(HELP); return 0; }
  try {
    const cwd = context.cwd ?? currentDirectory();
    if (args.target !== undefined) {
      const changed = await alignFile(resolve(cwd, args.target), resolve(cwd, args.template!), args);
      stdout((args.check ? (changed ? "Target is not aligned." : "Target is aligned.")
        : (changed ? "Updated target." : "Target already aligned.")) + EOL);
      return args.check && changed ? 1 : 0;
    }
    const plan = await planProject(cwd, { unknown: args.unknown });
    if (!args.check) await applyProject(plan);
    const changes = plan.updates.length, count = plan.pairs.length;
    const noun = changes === 1 ? "dotenv file" : "dotenv files";
    const aligned = count === 1 ? "1 dotenv file is aligned." : `All ${count} dotenv files are aligned.`;
    stdout((changes ? (args.check ? `${changes} ${noun} ${changes === 1 ? "needs" : "need"} alignment.`
      : `Aligned ${changes} ${noun}.`) : aligned) + EOL);
    if (plan.skipped) {
      stdout((plan.skipped === 1 ? "Skipped 1 template because its target does not exist."
        : `Skipped ${plan.skipped} templates because their targets do not exist.`) + EOL);
    }
    return args.check && changes ? 1 : 0;
  } catch (error) {
    let message: string;
    if (error instanceof Utf8DecodingError ||
        (error instanceof ProjectValidationError && error.failureKind === "invalid_utf8")) {
      message = "files must contain UTF-8 text.";
    } else if (error instanceof FileIOError ||
        (error instanceof ProjectValidationError && error.failureKind === "file_io")) {
      message = "cannot read or update files; check paths and permissions.";
    } else if (error instanceof FileValidationError || error instanceof ProjectValidationError ||
        error instanceof UnknownKeysError || error instanceof UnsupportedLocalSyntaxError) {
      message = error.message;
    } else {
      message = "unexpected failure; diagnostic details withheld.";
    }
    stderr(`align-dotenv: ${message}${EOL}`);
    return 2;
  }
}
