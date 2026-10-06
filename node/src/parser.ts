/** The narrow, raw-text parser in Python parser.py; no dotenv evaluation. */

// Python str.isspace()/re \s, not JavaScript \s (which also strips BOMs).
// Shared internally with reconciliation's Python lstrip/strip equivalents.
export const PYTHON_WHITESPACE =
  "[\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const KEY = "[A-Za-z_][A-Za-z0-9_]*";
// Python dot excludes only LF. Its $ accepts only end-of-string or before the
// final LF, whereas JavaScript $ also accepts CR and Unicode line separators.
const TAIL = "(?<value>[^\\n]*?)(?<ending>\\r?\\n?)(?=\\n?(?![\\s\\S]))";
export const ACTIVE_ASSIGNMENT = new RegExp(
  `^(?<head>${PYTHON_WHITESPACE}*(?:export${PYTHON_WHITESPACE}+)?(?<key>${KEY})${PYTHON_WHITESPACE}*=)${TAIL}`,
);
export const COMMENTED_ASSIGNMENT = new RegExp(
  `^(?<head>${PYTHON_WHITESPACE}*#${PYTHON_WHITESPACE}*(?:export${PYTHON_WHITESPACE}+)?(?<key>${KEY})${PYTHON_WHITESPACE}*=)${TAIL}`,
);
const LEADING_WHITESPACE = new RegExp(`^${PYTHON_WHITESPACE}+`);
const BLANK = new RegExp(`^${PYTHON_WHITESPACE}*(?![\\s\\S])`);

/** @internal Preserve Python's whitespace semantics across both pure modules. */
export function stripLeadingWhitespace(text: string): string {
  return text.replace(LEADING_WHITESPACE, "");
}

/** @internal Equivalent to not text.strip(), without JavaScript trim(). */
export function isBlank(text: string): boolean {
  return BLANK.test(text);
}

export interface Assignment {
  readonly key: string;
  readonly value: string;
  readonly commented: boolean;
  readonly line: string;
}

export class UnsupportedLocalSyntaxError extends Error {
  readonly lines: readonly number[];

  constructor(lines: readonly number[]) {
    super(`unsupported local syntax at lines ${lines.join(", ")}; no changes were made`);
    this.name = "UnsupportedLocalSyntaxError";
    this.lines = Object.freeze([...lines]);
  }
}

/** Split on LF only, preserving CRLF and all other raw characters. */
export function physicalLines(text: string): string[] {
  const parts = text.split("\n");
  const final = parts.pop()!;
  const lines = parts.map((part) => `${part}\n`);
  if (final) lines.push(final);
  return lines;
}

export function assignmentFromLine(line: string): Assignment | null {
  for (const [commented, pattern] of [
    [false, ACTIVE_ASSIGNMENT],
    [true, COMMENTED_ASSIGNMENT],
  ] as const) {
    const match = pattern.exec(line);
    if (match) {
      return Object.freeze({
        key: match.groups!.key!,
        value: match.groups!.value!,
        commented,
        line,
      });
    }
  }
  return null;
}

/** Final occurrence wins, without changing the key's first insertion order. */
export function assignments(lines: readonly string[]): Map<string, Assignment> {
  const current = new Map<string, Assignment>();
  for (const line of lines) {
    const assignment = assignmentFromLine(line);
    if (assignment) current.set(assignment.key, assignment);
  }
  return current;
}

function hasUnclosedQuote(rawValue: string): boolean {
  const value = rawValue.replace(/^[ \t]+/, "");
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return false;
  let escaped = false;
  for (const character of value.slice(1)) {
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === quote) return false;
  }
  return true;
}

export function validateLocalLines(lines: readonly string[]): void {
  const unsupported: number[] = [];
  for (const [index, line] of lines.entries()) {
    const assignment = assignmentFromLine(line);
    if (assignment) {
      const value = assignment.value;
      const backslashes = value.length - value.replace(/\\+(?![\s\S])/, "").length;
      if (hasUnclosedQuote(value) || (!assignment.commented && backslashes % 2 !== 0)) {
        unsupported.push(index + 1);
      }
    } else if (!isBlank(line) && !line.replace(/^[ \t]+/, "").startsWith("#")) {
      unsupported.push(index + 1);
    }
  }
  if (unsupported.length) throw new UnsupportedLocalSyntaxError(unsupported);
}
