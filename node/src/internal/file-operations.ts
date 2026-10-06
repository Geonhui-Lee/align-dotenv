/** @internal Shared filesystem primitives; not part of the public module API. */

import { randomBytes } from "node:crypto";
import { constants, promises as fs, type BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TextDecoder } from "node:util";

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

/** Safe domain errors; deliberately omit raw OS messages, paths and causes. */
export class FileIOError extends Error {
  constructor() {
    super("cannot read or update files; check paths and permissions.");
    this.name = "FileIOError";
  }
}

export class Utf8DecodingError extends TypeError {
  constructor() {
    super("files must contain UTF-8 text.");
    this.name = "Utf8DecodingError";
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export async function io<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof FileValidationError) throw error;
    throw new FileIOError();
  }
}

export async function pathInfo(path: string, follow: boolean): Promise<BigIntStats | null> {
  try {
    return await (follow ? fs.stat(path, { bigint: true }) : fs.lstat(path, { bigint: true }));
  } catch (error) {
    if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) return null;
    throw new FileIOError();
  }
}

export async function targetInfo(path: string, changed = false): Promise<BigIntStats> {
  const info = await pathInfo(path, false);
  if (changed && (!info || info.isSymbolicLink() || !info.isFile())) {
    throw new FileValidationError("target changed during alignment; refusing to update");
  }
  // Do not stat a target symlink merely to reproduce Python's diagnostic order.
  if (info?.isSymbolicLink()) throw new FileValidationError("target must not be a symbolic link");
  if (!info?.isFile()) throw new FileValidationError("target must be an existing regular file");
  return info;
}

function decode(bytes: Uint8Array): string {
  try {
    // ignoreBOM retains U+FEFF, matching Python utf-8 rather than utf-8-sig.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Utf8DecodingError();
  }
}

export async function readTarget(path: string): Promise<string> {
  let handle: FileHandle;
  try {
    // O_NOFOLLOW is available on POSIX, not universally on Windows. The lstat
    // guard below also rejects observed Windows symlinks before reading data.
    handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (hasCode(error, "ELOOP")) throw new FileValidationError("target must not be a symbolic link");
    throw new FileIOError();
  }
  const bytes = await io(async () => {
    try {
      await targetInfo(path);
      if (!(await handle.stat()).isFile()) {
        throw new FileValidationError("target must be an existing regular file");
      }
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  });
  return decode(bytes);
}

export async function writeAtomically(path: string, content: string, mode: number): Promise<void> {
  let temporaryPath: string | undefined;
  try {
    let handle: FileHandle | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = join(dirname(path), `.align-dotenv-${randomBytes(16).toString("hex")}.tmp`);
      try {
        handle = await fs.open(candidate, "wx", 0o600);
        temporaryPath = candidate; // Only clean paths we successfully created.
        break;
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
      }
    }
    if (!handle || !temporaryPath) throw new FileIOError();
    try {
      // writeFile completes the full write; there is never a write to the target.
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close(); // Close before rename, including on Windows.
    }
    await fs.chmod(temporaryPath, mode);
    await targetInfo(path, true);
    // One native rename, no unlink-target or copy/truncate fallback on any OS.
    await fs.rename(temporaryPath, path);
  } finally {
    if (temporaryPath !== undefined) {
      try {
        await fs.unlink(temporaryPath);
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }
    }
  }
}

export function validateIdentity(targetStat: BigIntStats, templateStat: BigIntStats): void {
  // Node exposes bigint identities on all supported OSes; fail closed when absent.
  if (targetStat.ino === 0n || templateStat.ino === 0n) {
    throw new FileValidationError("cannot determine file identity safely");
  }
  if (targetStat.dev === templateStat.dev && targetStat.ino === templateStat.ino) {
    throw new FileValidationError("target and template must be different files");
  }
}

export async function readText(path: string): Promise<string> {
  return decode(await io(() => fs.readFile(path)));
}

export function modeBits(info: BigIntStats): number {
  return Number(info.mode & 0o7777n);
}
