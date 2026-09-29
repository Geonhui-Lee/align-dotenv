"""Pure template-based dotenv reconciliation; no filesystem or UI dependencies."""

import re

from .parser import ACTIVE_ASSIGNMENT, COMMENTED_ASSIGNMENT, assignment_from_line, assignments


def _uncomment_head(head: str) -> str:
    return re.sub(r"^(\s*)#\s?", r"\1", head, count=1)


def align(template_text: str, current_text: str) -> str:
    """Render local values into the template; append locally defined unknown keys."""
    template_lines = template_text.splitlines(keepends=True)
    current = assignments(current_text.splitlines(keepends=True))
    template_keys = set(assignments(template_lines))
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

    unknown = [assignment.line for key, assignment in current.items() if key not in template_keys]
    if unknown:
        if rendered and rendered[-1] and not rendered[-1].endswith(("\n", "\r")):
            rendered[-1] += "\n"
        if rendered and rendered[-1].strip():
            rendered.append("\n")
        for index, line in enumerate(unknown):
            rendered.append(line)
            if index < len(unknown) - 1 and not line.endswith(("\n", "\r")):
                rendered.append("\n")

    return "".join(rendered)
