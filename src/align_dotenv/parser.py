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
