/** Pure template-based reconciliation corresponding to Python reconcile.py. */

import {
  ACTIVE_ASSIGNMENT,
  COMMENTED_ASSIGNMENT,
  PYTHON_WHITESPACE,
  assignmentFromLine,
  assignments,
  isBlank,
  physicalLines,
  stripLeadingWhitespace,
  validateLocalLines,
} from "./parser.js";

export type UnknownPolicy = "keep" | "remove" | "error";

export class UnknownKeysError extends Error {
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`unknown local keys: ${keys.join(", ")}`);
    this.name = "UnknownKeysError";
    this.keys = Object.freeze([...keys]);
  }
}

export interface Reconciliation {
  readonly content: string;
  readonly unknownKeys: readonly string[];
}

const COMMENT_HEAD = new RegExp(`^(${PYTHON_WHITESPACE}*)#${PYTHON_WHITESPACE}?`);

function hasEnding(line: string): boolean {
  return line.endsWith("\n") || line.endsWith("\r");
}

export function reconcile(
  templateText: string,
  currentText: string,
  unknown: UnknownPolicy = "keep",
): Reconciliation {
  // Keep a runtime guard for JavaScript callers; never echo the supplied value.
  if (unknown !== "keep" && unknown !== "remove" && unknown !== "error") {
    throw new RangeError("unknown policy must be keep, remove, or error");
  }
  const templateLines = physicalLines(templateText);
  const localLines = physicalLines(currentText);
  validateLocalLines(localLines);
  const current = assignments(localLines);
  const templateKeys = new Set(assignments(templateLines).keys());
  // All keys are ASCII, so default JS sort equals Python's code-point ordering.
  const unknownKeys = [...current.keys()].filter((key) => !templateKeys.has(key)).sort();
  if (unknown === "error" && unknownKeys.length) throw new UnknownKeysError(unknownKeys);
  const rendered: string[] = [];

  for (const line of templateLines) {
    const templateAssignment = assignmentFromLine(line);
    const local = templateAssignment ? current.get(templateAssignment.key) : undefined;
    if (!templateAssignment || !local) {
      rendered.push(line);
      continue;
    }
    const pattern = templateAssignment.commented ? COMMENTED_ASSIGNMENT : ACTIVE_ASSIGNMENT;
    const match = pattern.exec(line)!;
    let head = match.groups!.head!;
    if (templateAssignment.commented !== local.commented) {
      head = !local.commented
        ? head.replace(COMMENT_HEAD, "$1")
        : `# ${stripLeadingWhitespace(head)}`;
    }
    rendered.push(`${head}${local.value}${match.groups!.ending!}`);
  }

  const unknownLines = unknown === "keep"
    ? [...current.values()].filter((item) => !templateKeys.has(item.key)).map((item) => item.line)
    : [];
  if (unknownLines.length) {
    const lastIndex = rendered.length - 1;
    const last = rendered[lastIndex];
    if (last && !hasEnding(last)) rendered[lastIndex] = `${last}\n`;
    if (rendered.length && !isBlank(rendered[rendered.length - 1]!)) rendered.push("\n");
    for (const [index, line] of unknownLines.entries()) {
      rendered.push(line);
      if (index < unknownLines.length - 1 && !hasEnding(line)) rendered.push("\n");
    }
  }

  return Object.freeze({ content: rendered.join(""), unknownKeys: Object.freeze(unknownKeys) });
}

export function align(
  templateText: string,
  currentText: string,
  unknown: UnknownPolicy = "keep",
): string {
  return reconcile(templateText, currentText, unknown).content;
}
