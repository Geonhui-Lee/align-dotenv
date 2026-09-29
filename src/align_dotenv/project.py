"""Discover and preflight a project before updating any dotenv targets."""

from dataclasses import dataclass
import os
from pathlib import Path
import stat

from .files import FileValidationError, _read, _write_atomically
from .parser import UnsupportedLocalSyntaxError
from .reconcile import UnknownKeysError, UnknownPolicy, reconcile


EXCLUDED_DIRECTORIES = frozenset({".git", "node_modules", ".venv", "venv", "__pycache__"})
TEMPLATE_SUFFIXES = (".example", ".template")


class ProjectValidationError(ValueError):
    """Invalid project pairing; messages contain paths but never file contents."""


@dataclass(frozen=True)
class DotenvPair:
    target: Path
    template: Path


@dataclass(frozen=True)
class PlannedUpdate:
    target: Path
    content: str
    mode: int


@dataclass(frozen=True)
class ProjectPlan:
    pairs: tuple[DotenvPair, ...]
    updates: tuple[PlannedUpdate, ...]
    skipped: int


def _walk_error(error: OSError) -> None:
    raise error


def discover(root: Path) -> tuple[DotenvPair, ...]:
    """Find templates in sorted order, refusing ambiguous target mappings."""
    by_target: dict[Path, list[Path]] = {}
    for directory, directories, filenames in os.walk(root, followlinks=False, onerror=_walk_error):
        candidates = [name for name in directories if name not in EXCLUDED_DIRECTORIES]
        directories[:] = sorted(
            name for name in directories
            if name not in EXCLUDED_DIRECTORIES and not (Path(directory) / name).is_symlink()
            and not any(name.endswith(suffix) and name[:-len(suffix)].startswith(".env")
                        for suffix in TEMPLATE_SUFFIXES)
        )
        for name in sorted(filenames + candidates):
            for suffix in TEMPLATE_SUFFIXES:
                if name.endswith(suffix) and name[:-len(suffix)].startswith(".env"):
                    template = Path(directory) / name
                    target = template.with_name(name[:-len(suffix)])
                    by_target.setdefault(target, []).append(template)
                    break
    for target, templates in sorted(by_target.items()):
        if len(templates) > 1:
            paths = ", ".join(str(path.relative_to(root)) for path in sorted(templates))
            raise ProjectValidationError(
                f"multiple templates resolve to {target.relative_to(root)}: {paths}; no files were changed"
            )
    return tuple(DotenvPair(target, templates[0]) for target, templates in sorted(by_target.items()))


def plan_project(root: Path, *, unknown: UnknownPolicy = "keep") -> ProjectPlan:
    """Validate, read and reconcile every existing pair before any writes begin."""
    pairs = discover(root)
    templates = {pair.template for pair in pairs}
    existing: list[DotenvPair] = []
    updates: list[PlannedUpdate] = []
    skipped = 0
    for pair in pairs:
        label = str(pair.target.relative_to(root))
        if pair.target in templates:
            raise ProjectValidationError(
                f"{label}: a discovered template cannot also be a target; no files were changed"
            )
        if pair.template.is_symlink() or not pair.template.is_file():
            raise ProjectValidationError(
                f"{label}: template must be an existing regular file, not a symbolic link; "
                "no files were changed"
            )
        if not os.path.lexists(pair.target):
            skipped += 1
            continue
        try:
            if pair.target.is_symlink() or not pair.target.is_file():
                raise FileValidationError("target must be an existing regular file, not a symbolic link")
            if pair.target.samefile(pair.template):
                raise FileValidationError("target and template must be different files")
            template_text = _read(pair.template)
            current_text = _read(pair.target)
            result = reconcile(template_text, current_text, unknown)
            mode = stat.S_IMODE(pair.target.stat().st_mode)
        except (FileValidationError, UnsupportedLocalSyntaxError, UnknownKeysError) as error:
            raise ProjectValidationError(f"{label}: {error}; no files were changed") from error
        existing.append(pair)
        if result.content != current_text:
            updates.append(PlannedUpdate(pair.target, result.content, mode))
    return ProjectPlan(tuple(existing), tuple(updates), skipped)


def apply_project(plan: ProjectPlan) -> None:
    """Replace changed targets individually after the full project preflight."""
    for update in plan.updates:
        # A target replaced with a symlink since preflight must never be followed or overwritten.
        if update.target.is_symlink() or not update.target.is_file():
            raise FileValidationError("target changed since preflight; refusing to update")
        _write_atomically(update.target, update.content, update.mode)
