"""Minimal single-target CLI."""

import argparse
from pathlib import Path

from .files import align_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Align a local dotenv file with a template.")
    parser.add_argument("target", type=Path, help="existing local dotenv file to update")
    parser.add_argument("--template", required=True, type=Path, help="template file")
    args = parser.parse_args(argv)

    try:
        changed = align_file(args.target, args.template)
    except UnicodeError:
        parser.exit(1, "align-dotenv: files must contain UTF-8 text.\n")
    except OSError as error:
        parser.exit(1, f"align-dotenv: {error}\n")
    print("Updated target." if changed else "Target already aligned.")
    return 0
