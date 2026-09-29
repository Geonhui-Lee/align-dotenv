"""Pure template-based dotenv reconciliation; no filesystem or UI dependencies."""

import re
from dataclasses import dataclass
from typing import Literal

from .parser import (ACTIVE_ASSIGNMENT, COMMENTED_ASSIGNMENT, assignment_from_line,
                     assignments, physical_lines, validate_local_lines)

UnknownPolicy = Literal["keep", "remove", "error"]


class UnknownKeysError(ValueError):
    """Unknown local assignments under the error policy; contains names only."""

    def __init__(self, keys: tuple[str, ...]):
        self.keys = keys
        super().__init__(f"unknown local keys: {', '.join(keys)}")


@dataclass(frozen=True)
class Reconciliation:
    content: str
    unknown_keys: tuple[str, ...]


def _uncomment_head(head: str) -> str:
    return re.sub(r"^(\s*)#\s?", r"\1", head, count=1)


def reconcile(
    template_text: str, current_text: str, unknown: UnknownPolicy = "keep"
) -> Reconciliation:
    """Render local values into the template under an explicit unknown-key policy."""
    if unknown not in ("keep", "remove", "error"):
        raise ValueError("unknown policy must be keep, remove, or error")
    template_lines = physical_lines(template_text)
    local_lines = physical_lines(current_text)
    validate_local_lines(local_lines)
    current = assignments(local_lines)
    template_keys = set(assignments(template_lines))
    unknown_keys = tuple(sorted(key for key in current if key not in template_keys))
    if unknown == "error" and unknown_keys:
        raise UnknownKeysError(unknown_keys)
    rendered: list[str] = []

    for line in template_lines:
        template_assignment = assignment_from_line(line)
        if template_assignment is None or template_assignment.key not in current:
            rendered.append(line)
            continue

        local = current[template_assignment.key]
        pattern = COMMENTED_ASSIGNMENT if template_assignment.commented else ACTIVE_ASSIGNMENT
        match = pattern.match(line)
        assert match is not None
        head = match.group("head")
        if template_assignment.commented != local.commented:
            head = _uncomment_head(head) if not local.commented else f"# {head.lstrip()}"
        rendered.append(f"{head}{local.value}{match.group('ending')}")

    unknown_lines = (
        [assignment.line for key, assignment in current.items() if key not in template_keys]
        if unknown == "keep" else []
    )
    if unknown_lines:
        if rendered and rendered[-1] and not rendered[-1].endswith(("\n", "\r")):
            rendered[-1] += "\n"
        if rendered and rendered[-1].strip():
            rendered.append("\n")
        for index, line in enumerate(unknown_lines):
            rendered.append(line)
            if index < len(unknown_lines) - 1 and not line.endswith(("\n", "\r")):
                rendered.append("\n")

    return Reconciliation("".join(rendered), unknown_keys)


def align(template_text: str, current_text: str, unknown: UnknownPolicy = "keep") -> str:
    """Convenience interface for callers that only need the rendered text."""
    return reconcile(template_text, current_text, unknown).content
