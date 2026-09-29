"""Parse only the simple single-line assignment forms supported by the tool."""

from dataclasses import dataclass
import re


KEY = r"[A-Za-z_][A-Za-z0-9_]*"
ACTIVE_ASSIGNMENT = re.compile(
    rf"^(?P<head>\s*(?:export\s+)?(?P<key>{KEY})\s*=)(?P<value>.*?)(?P<ending>\r?\n?)$"
)
COMMENTED_ASSIGNMENT = re.compile(
    rf"^(?P<head>\s*#\s*(?:export\s+)?(?P<key>{KEY})\s*=)(?P<value>.*?)(?P<ending>\r?\n?)$"
)


@dataclass(frozen=True)
class Assignment:
    key: str
    value: str
    commented: bool
    line: str


class UnsupportedLocalSyntaxError(ValueError):
    """Local content that cannot safely be reconciled; line numbers only."""

    def __init__(self, lines: tuple[int, ...]):
        self.lines = lines
        super().__init__(f"unsupported local syntax at lines {', '.join(map(str, lines))}; no changes were made")


def physical_lines(text: str) -> list[str]:
    """Split on LF only, preserving CRLF and other characters within raw values."""
    parts = text.split("\n")
    return [part + "\n" for part in parts[:-1]] + ([parts[-1]] if parts[-1] else [])


def _has_unclosed_quote(value: str) -> bool:
    value = value.lstrip(" \t")
    if not value or value[0] not in "\"'":
        return False
    quote = value[0]
    escaped = False
    for character in value[1:]:
        if escaped:
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == quote:
            return False
    return True


def validate_local_lines(lines: list[str]) -> None:
    """Reject meaningful lines outside our supported single-line syntax."""
    unsupported: list[int] = []
    for number, line in enumerate(lines, start=1):
        assignment = assignment_from_line(line)
        if assignment is not None:
            # A dangling quote or shell continuation may consume subsequent lines.
            value = assignment.value
            if _has_unclosed_quote(value) or (
                not assignment.commented and value.endswith("\\")
                and (len(value) - len(value.rstrip("\\"))) % 2 != 0
            ):
                unsupported.append(number)
        elif line.strip() and not line.lstrip(" \t").startswith("#"):
            unsupported.append(number)
    if unsupported:
        raise UnsupportedLocalSyntaxError(tuple(unsupported))


def assignment_from_line(line: str) -> Assignment | None:
    for commented, pattern in ((False, ACTIVE_ASSIGNMENT), (True, COMMENTED_ASSIGNMENT)):
        match = pattern.match(line)
        if match:
            return Assignment(match.group("key"), match.group("value"), commented, line)
    return None


def assignments(lines: list[str]) -> dict[str, Assignment]:
    """Use the final occurrence of each key, as in the reference implementation."""
    return {
        assignment.key: assignment
        for line in lines
        if (assignment := assignment_from_line(line)) is not None
    }
