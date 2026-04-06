"""
Corpus search module — keyword/regex search across all corpus text files.
Used by agents during development to find specific information.
"""
import os
import re
from pathlib import Path
from typing import Optional


CORPUS_DIR = Path(__file__).resolve().parent.parent.parent / "scraped_data_corpus" / "txt"

# Prefer web-scraped versions over image-PDF stubs
_WEB_PRIORITY = {
    "ECE_catalog.txt": "ECE_catalog_web.txt",
    "ece_catalog_bse.txt": "ece_catalog_bse_web.txt",
    "Math_Catalog.txt": "Math_Catalog_web.txt",
    "jsp_course_offering_2026.txt": "jsp_course_offering_2026_web.txt",
}


def get_corpus_files() -> list[Path]:
    """Return all usable corpus text files, preferring web versions."""
    skip = set(_WEB_PRIORITY.keys())
    files = []
    for f in sorted(CORPUS_DIR.iterdir()):
        if not f.is_file() or not f.name.endswith(".txt"):
            continue
        if f.name in skip and (CORPUS_DIR / _WEB_PRIORITY[f.name]).exists():
            continue
        files.append(f)
    return files


def search(
    query: str,
    *,
    regex: bool = False,
    case_sensitive: bool = False,
    context_lines: int = 2,
    max_results: int = 50,
    files: Optional[list[str]] = None,
) -> list[dict]:
    """
    Search corpus text files for a query string or regex pattern.

    Returns list of {file, line_num, line, context_before, context_after}.
    """
    flags = 0 if case_sensitive else re.IGNORECASE
    if regex:
        pattern = re.compile(query, flags)
    else:
        pattern = re.compile(re.escape(query), flags)

    results = []
    for fpath in get_corpus_files():
        if files and fpath.name not in files:
            continue
        try:
            lines = fpath.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue

        for i, line in enumerate(lines):
            if pattern.search(line):
                start = max(0, i - context_lines)
                end = min(len(lines), i + context_lines + 1)
                results.append({
                    "file": fpath.name,
                    "line_num": i + 1,
                    "line": line.strip(),
                    "context_before": [l.strip() for l in lines[start:i]],
                    "context_after": [l.strip() for l in lines[i + 1 : end]],
                })
                if len(results) >= max_results:
                    return results
    return results


def course_lookup(course_id: str) -> list[dict]:
    """
    Look up a specific course by ID (e.g., 'ECE 302', 'M 408C').
    Searches all corpus files for mentions and returns context.
    """
    # Normalize: "ECE302" -> "ECE 302", "M408C" -> "M 408C"
    normalized = re.sub(r"([A-Z]+)\s*(\d)", r"\1 \2", course_id.upper().strip())
    return search(normalized, context_lines=5, max_results=30)


def list_files() -> list[dict]:
    """List all corpus files with their sizes."""
    result = []
    for f in get_corpus_files():
        size = f.stat().st_size
        result.append({"name": f.name, "size": size, "size_human": _human_size(size)})
    return result


def _human_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if nbytes < 1024.0:
            return f"{nbytes:.1f} {unit}"
        nbytes /= 1024.0
    return f"{nbytes:.1f} TB"
