/** Single-file alignment corresponding to Python files.py. */
import {
  FileValidationError, io, modeBits, pathInfo, readTarget, readText,
  targetInfo, validateIdentity, writeAtomically,
} from "./internal/file-operations.js";
import { reconcile, type UnknownPolicy } from "./reconcile.js";

export { FileValidationError, FileIOError, Utf8DecodingError } from "./internal/file-operations.js";

export interface AlignFileOptions {
  readonly unknown?: UnknownPolicy;
  readonly check?: boolean;
}

export async function alignFile(
  target: string,
  template: string,
  options: AlignFileOptions = {},
): Promise<boolean> {
  const targetStat = await targetInfo(target);
  const templateStat = await pathInfo(template, true); // Explicit mode permits template symlinks.
  if (!templateStat?.isFile()) throw new FileValidationError("template must be an existing regular file");
  validateIdentity(targetStat, templateStat);
  const templateText = await readText(template);
  const currentText = await readTarget(target);
  const result = reconcile(
    templateText,
    currentText,
    options.unknown === undefined ? "keep" : options.unknown,
  );
  if (result.content === currentText) return false;
  if (options.check) return true;
  const mode = modeBits(await targetInfo(target, true));
  await io(() => writeAtomically(target, result.content, mode));
  return true;
}
