"""Read and replace a single target without exposing its values to the CLI."""

import os
from pathlib import Path
import stat
import tempfile

from .reconcile import align


def _read(path: Path) -> str:
    # newline="" disables universal newline conversion; template layout stays intact.
    with path.open("r", encoding="utf-8", newline="") as stream:
        return stream.read()


def _write_atomically(path: Path, content: str, mode: int) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="", dir=path.parent, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(content)
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def align_file(target: Path, template: Path) -> bool:
    """Align an existing target; return whether its contents changed."""
    template_text = _read(template)
    current_text = _read(target)
    result = align(template_text, current_text)
    if result == current_text:
        return False
    mode = stat.S_IMODE(target.stat().st_mode)
    _write_atomically(target, result, mode)
    return True
