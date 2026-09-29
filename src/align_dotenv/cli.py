"""Single-target CLI with optional project-wide orchestration."""

import argparse
from pathlib import Path

from .files import FileValidationError, align_file
from .parser import UnsupportedLocalSyntaxError
from .project import ProjectValidationError, apply_project, plan_project
from .reconcile import UnknownKeysError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Align a local dotenv file with a template.")
    parser.add_argument("target", nargs="?", type=Path, help="existing local dotenv file to update")
    parser.add_argument("--template", type=Path, help="template file (required with target)")
    parser.add_argument("--unknown", choices=("keep", "remove", "error"), default="keep",
                        help="how to handle local keys absent from the template (default: keep)")
    parser.add_argument("--check", action="store_true", help="report misalignment without writing")
    args = parser.parse_args(argv)
    if (args.target is None) != (args.template is None):
        parser.error("target and --template must be supplied together")

    try:
        if args.target is None:
            plan = plan_project(Path.cwd(), unknown=args.unknown)
            if not args.check:
                apply_project(plan)
        else:
            changed = align_file(args.target, args.template, unknown=args.unknown, check=args.check)
    except (FileValidationError, ProjectValidationError, UnknownKeysError, UnsupportedLocalSyntaxError) as error:
        parser.exit(2, f"align-dotenv: {error}\n")
    except UnicodeError:
        parser.exit(2, "align-dotenv: files must contain UTF-8 text.\n")
    except OSError:
        parser.exit(2, "align-dotenv: cannot read or update files; check paths and permissions.\n")
    if args.target is None:
        count = len(plan.pairs)
        changes = len(plan.updates)
        noun = "dotenv file" if changes == 1 else "dotenv files"
        aligned = "1 dotenv file is aligned." if count == 1 else f"All {count} dotenv files are aligned."
        if args.check:
            print(f"{changes} {noun} {'needs' if changes == 1 else 'need'} alignment." if changes else
                  aligned)
        else:
            print(f"Aligned {changes} {noun}." if changes else
                  aligned)
        if plan.skipped:
            if plan.skipped == 1:
                print("Skipped 1 template because its target does not exist.")
            else:
                print(f"Skipped {plan.skipped} templates because their targets do not exist.")
        return 1 if args.check and changes else 0
    if args.check:
        if changed:
            print("Target is not aligned.")
            return 1
        print("Target is aligned.")
    else:
        print("Updated target." if changed else "Target already aligned.")
    return 0
