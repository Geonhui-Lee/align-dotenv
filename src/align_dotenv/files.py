"""Read and replace a single target without exposing its values to the CLI."""

import os
from pathlib import Path
import stat
import tempfile

from .reconcile import UnknownPolicy, reconcile


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


class FileValidationError(ValueError):
    """Invalid target or template path, without exposing file contents."""


def align_file(
    target: Path, template: Path, *, unknown: UnknownPolicy = "keep", check: bool = False
) -> bool:
    """Align existing files; return whether contents differ (without writing in check mode)."""
    if not target.is_file():
        raise FileValidationError("target must be an existing regular file")
    if target.is_symlink():
        raise FileValidationError("target must not be a symbolic link")
    if not template.is_file():
        raise FileValidationError("template must be an existing regular file")
    if target.samefile(template):
        raise FileValidationError("target and template must be different files")
    template_text = _read(template)
    current_text = _read(target)
    result = reconcile(template_text, current_text, unknown)
    if result.content == current_text:
        return False
    if check:
        return True
    mode = stat.S_IMODE(target.stat().st_mode)
    _write_atomically(target, result.content, mode)
    return True
