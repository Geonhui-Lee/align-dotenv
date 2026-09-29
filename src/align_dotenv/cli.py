"""Minimal single-target CLI."""

import argparse
from pathlib import Path

from .files import FileValidationError, align_file
from .parser import UnsupportedLocalSyntaxError
from .reconcile import UnknownKeysError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Align a local dotenv file with a template.")
    parser.add_argument("target", type=Path, help="existing local dotenv file to update")
    parser.add_argument("--template", required=True, type=Path, help="template file")
    parser.add_argument("--unknown", choices=("keep", "remove", "error"), default="keep",
                        help="how to handle local keys absent from the template (default: keep)")
    parser.add_argument("--check", action="store_true", help="report misalignment without writing")
    args = parser.parse_args(argv)

    try:
        changed = align_file(args.target, args.template, unknown=args.unknown, check=args.check)
    except (FileValidationError, UnknownKeysError, UnsupportedLocalSyntaxError) as error:
        parser.exit(2, f"align-dotenv: {error}\n")
    except UnicodeError:
        parser.exit(2, "align-dotenv: files must contain UTF-8 text.\n")
    except OSError:
        parser.exit(2, "align-dotenv: cannot read or update files; check paths and permissions.\n")
    if args.check:
        if changed:
            print("Target is not aligned.")
            return 1
        print("Target is aligned.")
    else:
        print("Updated target." if changed else "Target already aligned.")
    return 0
