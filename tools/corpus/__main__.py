"""
Corpus Agent CLI — Search, lookup, and extract structured data from the
UT Austin ECE scraped data corpus.

Usage:
  python -m tools.corpus search "ECE 460N"
  python -m tools.corpus lookup "ECE 460N"
  python -m tools.corpus files
  python -m tools.corpus extract-all
  python -m tools.corpus extract-courses
  python -m tools.corpus extract-prereqs
  python -m tools.corpus extract-tech-cores
  python -m tools.corpus extract-degree-reqs
  python -m tools.corpus extract-offering
"""
import argparse
import json
import sys
from pathlib import Path

from .search import search, course_lookup, list_files
from .extract_courses import extract_all as extract_courses
from .extract_prereqs import extract_all as extract_prereqs
from .extract_tech_cores import extract_all as extract_tech_cores
from .extract_degree_reqs import extract_all as extract_degree_reqs
from .extract_offering import extract_all as extract_offering

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def cmd_search(args):
    results = search(
        args.query,
        regex=args.regex,
        case_sensitive=args.case_sensitive,
        context_lines=args.context,
        max_results=args.max_results,
    )
    if not results:
        print(f"No results for: {args.query}")
        return

    for r in results:
        print(f"\n--- {r['file']}:{r['line_num']} ---")
        for ctx in r["context_before"]:
            print(f"  {ctx}")
        print(f"→ {r['line']}")
        for ctx in r["context_after"]:
            print(f"  {ctx}")

    print(f"\n[{len(results)} results]")


def cmd_lookup(args):
    results = course_lookup(args.course_id)
    if not results:
        print(f"No mentions found for: {args.course_id}")
        return

    seen_files = set()
    for r in results:
        if r["file"] not in seen_files:
            seen_files.add(r["file"])
            print(f"\n=== {r['file']} ===")
        print(f"  Line {r['line_num']}: {r['line']}")
        for ctx in r["context_after"][:2]:
            if ctx.strip():
                print(f"    {ctx}")

    print(f"\n[{len(results)} mentions across {len(seen_files)} files]")


def cmd_files(args):
    files = list_files()
    if not files:
        print("No corpus files found.")
        return

    total = 0
    for f in files:
        print(f"  {f['size_human']:>8s}  {f['name']}")
        total += f["size"]
    print(f"\n  {len(files)} files, {total / 1024:.0f} KB total")


def cmd_extract_all(args):
    output = DATA_DIR
    output.mkdir(parents=True, exist_ok=True)

    print("Extracting all data files...")

    # 1. Course catalog
    print("\n[1/5] Course catalog...")
    catalog = extract_courses(output / "course-catalog.json")
    print(f"  → {len(catalog)} courses")

    # 2. Prerequisite graph
    print("\n[2/5] Prerequisite graph...")
    graph = extract_prereqs(output / "prerequisite-graph.json")
    print(f"  → {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")

    # 3. Tech cores
    print("\n[3/5] Tech core tracks...")
    cores = extract_tech_cores(output / "tech-cores.json")
    print(f"  → {len(cores)} tracks")

    # 4. Degree requirements
    print("\n[4/5] Degree requirements...")
    reqs = extract_degree_reqs(output / "degree-requirements.json")
    print(f"  → {len(reqs['ece_core']['courses'])} ECE core courses")

    # 5. Offering schedule
    print("\n[5/5] Offering schedule...")
    sched = extract_offering(output / "offering-schedule.json")
    print(f"  → {len(sched)} courses with offering data")

    print(f"\nAll files saved to {output}/")
    print("Done. Hand-verify the output before committing.")


def cmd_extract_single(args):
    output = DATA_DIR
    output.mkdir(parents=True, exist_ok=True)

    extractors = {
        "extract-courses": ("course-catalog.json", extract_courses),
        "extract-prereqs": ("prerequisite-graph.json", extract_prereqs),
        "extract-tech-cores": ("tech-cores.json", extract_tech_cores),
        "extract-degree-reqs": ("degree-requirements.json", extract_degree_reqs),
        "extract-offering": ("offering-schedule.json", extract_offering),
    }

    filename, fn = extractors[args.command]
    out_path = output / filename
    data = fn(out_path)
    print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
    print(f"\n... Saved to {out_path}")


def main():
    parser = argparse.ArgumentParser(
        prog="corpus-agent",
        description="Search and extract structured data from the UT Austin ECE corpus",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # search
    p_search = subparsers.add_parser("search", help="Search corpus files")
    p_search.add_argument("query", help="Search query")
    p_search.add_argument("--regex", "-r", action="store_true", help="Treat query as regex")
    p_search.add_argument("--case-sensitive", "-c", action="store_true")
    p_search.add_argument("--context", "-C", type=int, default=2, help="Context lines")
    p_search.add_argument("--max-results", "-n", type=int, default=20)

    # lookup
    p_lookup = subparsers.add_parser("lookup", help="Look up a specific course")
    p_lookup.add_argument("course_id", help="Course ID, e.g., 'ECE 460N'")

    # files
    subparsers.add_parser("files", help="List corpus files")

    # extract-all
    subparsers.add_parser("extract-all", help="Extract all JSON data files")

    # Individual extractors
    for name in [
        "extract-courses", "extract-prereqs", "extract-tech-cores",
        "extract-degree-reqs", "extract-offering",
    ]:
        subparsers.add_parser(name, help=f"Run {name} and save output")

    args = parser.parse_args()

    if args.command == "search":
        cmd_search(args)
    elif args.command == "lookup":
        cmd_lookup(args)
    elif args.command == "files":
        cmd_files(args)
    elif args.command == "extract-all":
        cmd_extract_all(args)
    else:
        cmd_extract_single(args)


if __name__ == "__main__":
    main()
