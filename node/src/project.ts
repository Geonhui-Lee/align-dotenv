/** Recursive discovery, full preflight and per-file application; no CLI. */
import { promises as fs } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  FileIOError, FileValidationError, Utf8DecodingError, io, modeBits,
  pathInfo, readTarget, readText, targetInfo, validateIdentity, writeAtomically,
} from "./internal/file-operations.js";
import { UnsupportedLocalSyntaxError } from "./parser.js";
import { reconcile, UnknownKeysError, type UnknownPolicy } from "./reconcile.js";

const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", ".venv", "venv", "__pycache__"]);
const TEMPLATE_SUFFIXES = [".example", ".template"];

export class ProjectValidationError extends Error {
  readonly failureKind?: "invalid_utf8" | "file_io";

  constructor(message: string, failureKind?: "invalid_utf8" | "file_io") {
    super(message);
    this.name = "ProjectValidationError";
    this.failureKind = failureKind;
  }
}

export interface DotenvPair {
  readonly target: string;
  readonly template: string;
}

export interface PlannedUpdate {
  readonly target: string;
  readonly content: string;
  readonly mode: number;
}

export interface ProjectPlan {
  readonly pairs: readonly DotenvPair[];
  readonly updates: readonly PlannedUpdate[];
  readonly skipped: number;
}

export interface PlanProjectOptions {
  readonly unknown?: UnknownPolicy;
}

// Python sorts names by Unicode code points, not locale or UTF-16 code units.
function compareText(a: string, b: string): number {
  const first = Array.from(a), second = Array.from(b);
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const difference = first[i]!.codePointAt(0)! - second[i]!.codePointAt(0)!;
    if (difference) return difference;
  }
  return first.length - second.length;
}

function comparePaths(a: string, b: string): number {
  // pathlib orders components; Windows pathlib additionally case-folds paths.
  const first = (process.platform === "win32" ? a.toLowerCase() : a).split(sep);
  const second = (process.platform === "win32" ? b.toLowerCase() : b).split(sep);
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const difference = compareText(first[i]!, second[i]!);
    if (difference) return difference;
  }
  return first.length - second.length;
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function targetName(name: string): string | undefined {
  for (const suffix of TEMPLATE_SUFFIXES) {
    if (name.endsWith(suffix)) {
      const stem = name.slice(0, -suffix.length);
      if (stem.startsWith(".env")) return stem;
    }
  }
  return undefined;
}

export async function discover(root: string): Promise<readonly DotenvPair[]> {
  const byTarget = new Map<string, { target: string; templates: string[] }>();
  async function walk(directory: string): Promise<void> {
    const names = (await io(() => fs.readdir(directory))).sort(compareText);
    const directories: string[] = [];
    for (const name of names) {
      const path = join(directory, name);
      const info = await pathInfo(path, false);
      // os.walk classifies directory symlinks as directories, but never descends.
      const isDirectory = info?.isDirectory() ||
        (info?.isSymbolicLink() && (await pathInfo(path, true))?.isDirectory());
      if (isDirectory && EXCLUDED_DIRECTORIES.has(name)) continue;
      const stem = targetName(name);
      if (stem !== undefined) {
        const target = join(directory, stem);
        const key = pathKey(target);
        const entry = byTarget.get(key) ?? { target, templates: [] };
        entry.templates.push(path);
        byTarget.set(key, entry);
      }
      // Template-looking directories are candidates, not traversal roots.
      if (isDirectory && !info?.isSymbolicLink() && stem === undefined) directories.push(path);
    }
    for (const directory of directories) await walk(directory);
  }
  await walk(root);
  const entries = [...byTarget.values()].sort((a, b) => comparePaths(a.target, b.target));
  for (const { target, templates } of entries) {
    if (templates.length > 1) {
      const labels = templates.sort(comparePaths).map((path) => relative(root, path)).join(", ");
      throw new ProjectValidationError(
        `multiple templates resolve to ${relative(root, target)}: ${labels}; no files were changed`,
      );
    }
  }
  return Object.freeze(entries.map(({ target, templates }) => Object.freeze({ target, template: templates[0]! })));
}

export async function planProject(root: string, options: PlanProjectOptions = {}): Promise<ProjectPlan> {
  const pairs = await discover(root);
  const templates = new Set(pairs.map((pair) => pathKey(pair.template)));
  const existing: DotenvPair[] = [];
  const updates: PlannedUpdate[] = [];
  let skipped = 0;
  for (const pair of pairs) {
    const label = relative(root, pair.target);
    const fail = (message: string) => new ProjectValidationError(`${label}: ${message}; no files were changed`);
    if (templates.has(pathKey(pair.target))) {
      throw fail("a discovered template cannot also be a target");
    }
    try {
      const templateStat = await pathInfo(pair.template, false);
      if (!templateStat?.isFile() || templateStat.isSymbolicLink()) {
        throw new FileValidationError("template must be an existing regular file, not a symbolic link");
      }
      const targetStat = await pathInfo(pair.target, false);
      if (targetStat === null) {
        skipped++;
        continue;
      }
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
        throw new FileValidationError("target must be an existing regular file, not a symbolic link");
      }
      validateIdentity(targetStat, templateStat);
      const templateText = await readText(pair.template);
      const currentText = await readTarget(pair.target);
      const result = reconcile(templateText, currentText, options.unknown === undefined ? "keep" : options.unknown);
      // Python captures mode even for unchanged targets, after reconciliation.
      const mode = modeBits(await targetInfo(pair.target, true));
      existing.push(pair);
      if (result.content !== currentText) updates.push(Object.freeze({ target: pair.target, content: result.content, mode }));
    } catch (error) {
      if (error instanceof FileValidationError || error instanceof UnsupportedLocalSyntaxError ||
          error instanceof UnknownKeysError || error instanceof Utf8DecodingError || error instanceof FileIOError) {
        // No raw cause/payload retained; the CLI can normalize by category.
        throw new ProjectValidationError(`${label}: ${error.message}; no files were changed`,
          error instanceof Utf8DecodingError ? "invalid_utf8" : error instanceof FileIOError ? "file_io" : undefined);
      }
      throw error;
    }
  }
  return Object.freeze({ pairs: Object.freeze(existing), updates: Object.freeze(updates), skipped });
}

export async function applyProject(plan: ProjectPlan): Promise<void> {
  for (const update of plan.updates) {
    const info = await pathInfo(update.target, false);
    if (!info?.isFile() || info.isSymbolicLink()) {
      throw new FileValidationError("target changed since preflight; refusing to update");
    }
    await io(() => writeAtomically(update.target, update.content, update.mode));
  }
}
