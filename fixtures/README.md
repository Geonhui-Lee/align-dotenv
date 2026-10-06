# Shared behavioral fixtures (schema version 1)

These are reviewed examples of Python v0.2.0 behavior, not generated expectations.
All values are fictitious. Both runtimes must consume these same files; do not
regenerate expected output from the implementation being tested.

- `reconciliation/cases.json`: successful reconciliation, including raw values,
  state, duplicates, unknown policies, Unicode, exact endings and empty inputs.
- `invalid/cases.json`: safe failures, including strict UTF-8 decoding failures.

Each document has `schema_version: 1` and a `cases` array with unique `id` names.
`template`, `local`, and `expected` are literal JSON strings: encode them as UTF-8
without newline conversion or BOM stripping. Escaped `\r`, `\n`, and Unicode
characters are significant. JSON avoids editor/Git conversion of CRLF payloads.
An input may instead use `template_hex` or `local_hex` (never both representations
of that input); these are raw bytes decoded strictly at the filesystem boundary.

Success cases specify `unknown` (`keep`, `remove`, or `error`), `expected`, and
`unknown_keys` (sorted names, including under `remove`). Reconcile again with the
same template and policy to verify idempotency. The optional `followup_error`
instead records a known non-idempotent template-validation limitation; it is not
permission to skip checking the second pass.

Failure cases specify `policies` and `error`: runtime-neutral `kind`, exact safe
`message`, and `lines` (1-based physical LF line numbers) or sorted `keys` where
applicable. Kinds are `unsupported_local_syntax`, `unknown_keys`, and
`invalid_utf8`. Runtime exception class names are deliberately not part of the
format. Syntax validation precedes unknown-key policy handling.

## Consumer requirements

Compare output as exact strings/UTF-8 bytes, never normalized lines. Test the pure
reconciler and file/CLI boundary. Successful check mode returns 1 iff bytes would
change and must not write; write mode returns 0. Failures return 2, preserve input,
and have empty stdout with stderr `align-dotenv: <message>\n`. Successful CLI
messages are specified in `.agents/NODE_PORT.md`; they contain no dotenv values.
CLI message endings are logical LF, translated by Python standard streams to
platform newlines; this does not permit normalizing dotenv file bytes.
Repeated alignment must not rewrite unchanged files. Test diagnostics should use
case IDs, not dump input/output payloads or subprocess output on failure.

`tests/test_fixtures.py` is the Python consumer. `node/test/fixtures.test.mjs` is
the pure Node consumer for all 34 string-level cases. `node/test/file-fixtures.test.mjs`
exercises all 36 cases through real files, including the 2 invalid-UTF-8 byte cases
under every listed policy with and without check mode. No byte cases remain deferred.
`node/test/project-fixtures.test.mjs` exercises the same 36 cases through project
planning/application, with invalid cases placed after a valid pair to verify full
preflight prevents earlier writes. No separate Node/project content corpus exists.
Existing focused filesystem and project tests remain authoritative for safety
scenarios (links, failure cleanup, permissions, discovery and preflight);
JSON does not pretend to model OS races or
mocked failures. See `.agents/NODE_PORT.md` for the audit and future port sequence.
