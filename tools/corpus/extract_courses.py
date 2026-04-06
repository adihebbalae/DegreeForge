"""
Extract structured course data from the web-scraped UT Austin catalog pages.
Outputs course-catalog.json matching the PRD schema.

Sources:
  - ECE_catalog_web.txt  (all ECE courses)
  - Math_Catalog_web.txt (all Math courses)
"""
import json
import re
from pathlib import Path
from typing import Optional

from .search import CORPUS_DIR


def _clean(text: str) -> str:
    """Collapse whitespace including non-breaking spaces."""
    text = text.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _normalize_nbsp(text: str) -> str:
    """Replace non-breaking spaces with regular spaces throughout."""
    return text.replace("\u00a0", " ")


def parse_ece_catalog(text: str) -> list[dict]:
    """Parse ECE course catalog text into structured records."""
    text = _normalize_nbsp(text)
    courses = []
    # Match course headers in web-scraped format:
    #   "ECE 302 (TCCN: ENGR 2305). Introduction to Electrical Engineering."
    #   "ECE 306. Introduction to Computing."
    # Also handles combined like: "ECE 160, 260, 360, 460. Title."
    # May or may not have markdown ### prefix
    header_pattern = re.compile(
        r"(?:#{3,5}\s+)?"                         # optional markdown prefix
        r"(ECE\s+[\d]+[A-Z]*(?:,\s*[\d]+[A-Z]*)*)"  # course numbers
        r"(?:\s*\(TCCN:[^)]+\))?"                  # optional TCCN
        r"\.\s*"
        r"(.+?)\.\s*$",                            # title (terminated by period)
        re.MULTILINE,
    )

    matches = list(header_pattern.finditer(text))
    for idx, m in enumerate(matches):
        raw_numbers = m.group(1)
        title = _clean(m.group(2).rstrip("."))

        # Get body text until next header
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = _clean(text[start:end])

        # Parse course numbers (handles "ECE 160, 260, 360, 460")
        nums = re.findall(r"(\d+[A-Z]*)", raw_numbers)
        prefix = "ECE"

        # Extract credits from body
        credits = _extract_credits(body)

        # Extract prerequisites
        prereqs = _extract_prerequisites(body)

        # Extract corequisites
        coreqs = _extract_corequisites(body)

        # Extract description (text before "Prerequisite:" or "Offered on")
        description = _extract_description(body)

        # Extract offering basis
        grading = "letter"
        if "pass/fail basis only" in body.lower():
            grading = "pass/fail"
        elif "credit/no credit basis only" in body.lower():
            grading = "credit/no-credit"

        for num in nums:
            course_id = f"{prefix} {num}"
            courses.append({
                "id": course_id,
                "title": title,
                "credits": credits,
                "description": description,
                "prerequisites": prereqs,
                "corequisites": coreqs,
                "grading": grading,
                "department": "ECE",
            })

    return courses


def parse_math_catalog(text: str) -> list[dict]:
    """Parse Math course catalog text into structured records."""
    text = _normalize_nbsp(text)
    courses = []
    header_pattern = re.compile(
        r"(?:#{3,5}\s+)?"
        r"(M\s+[\d]+[A-Z]*(?:,\s*(?:\d+[A-Z]*|M\s+\d+[A-Z]*))*)"
        r"(?:\s*\(TCCN:[^)]+\))?"
        r"\.\s*"
        r"(.+?)\.\s*$",
        re.MULTILINE,
    )

    matches = list(header_pattern.finditer(text))
    for idx, m in enumerate(matches):
        raw_numbers = m.group(1)
        title = _clean(m.group(2).rstrip("."))

        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = _clean(text[start:end])

        credits = _extract_credits(body)
        prereqs = _extract_prerequisites(body)
        coreqs = _extract_corequisites(body)
        description = _extract_description(body)

        grading = "letter"
        if "pass/fail basis only" in body.lower():
            grading = "pass/fail"
        elif "credit/no credit basis only" in body.lower():
            grading = "credit/no-credit"

        # Parse possibly combined numbers like "M 308L, 408L"
        nums = re.findall(r"(\d+[A-Z]*)", raw_numbers)
        for num in nums:
            course_id = f"M {num}"
            courses.append({
                "id": course_id,
                "title": title,
                "credits": credits,
                "description": description,
                "prerequisites": prereqs,
                "corequisites": coreqs,
                "grading": grading,
                "department": "M",
            })

    return courses


def _extract_credits(body: str) -> Optional[int]:
    """Extract credit hours from course body text."""
    # "Three lecture hours ... for one semester" -> 3
    hour_words = {
        "one": 1, "two": 2, "three": 3, "four": 4,
        "five": 5, "six": 6, "seven": 7, "eight": 8,
    }

    # Look for total pattern first
    m = re.search(r"(\w+)\s+(?:semester\s+)?(?:credit\s+)?hours?\s+(?:a\s+week\s+)?for\s+one\s+semester", body, re.IGNORECASE)
    if m:
        word = m.group(1).lower()
        if word in hour_words:
            return hour_words[word]

    # Check for explicit "X lecture hours and Y laboratory hours"
    lec_match = re.search(r"(\w+)\s+lecture\s+hours?", body, re.IGNORECASE)
    lab_match = re.search(r"(\w+)\s+laborator\w*\s+hours?", body, re.IGNORECASE)
    disc_match = re.search(r"(\w+)\s+discussion\s+(?:sessions?\s+|hours?\s+)", body, re.IGNORECASE)

    total = 0
    found = False
    for match in [lec_match, lab_match, disc_match]:
        if match:
            word = match.group(1).lower()
            if word in hour_words:
                total += hour_words[word]
                found = True
    # Usually credit hours = lecture + lab (not discussion)
    if lec_match and lab_match:
        lec = hour_words.get(lec_match.group(1).lower(), 0)
        lab = hour_words.get(lab_match.group(1).lower(), 0)
        return lec + lab
    if found:
        return total if total > 0 else None
    return None


# Map long department names (from web-scraped catalog) to short IDs
_DEPT_NAMES = {
    "Electrical and Computer Engineering": "ECE",
    "Electrical Engineering": "ECE",
    "Mathematics": "M",
    "Physics": "PHY",
    "Computer Science": "C S",
    "Biomedical Engineering": "BME",
    "Rhetoric and Writing": "RHE",
    "English": "E",
    "Government": "GOV",
    "History": "HIS",
}


def _normalize_dept_names(text: str) -> str:
    """Replace full department names with short IDs for regex extraction."""
    for long_name, short_id in _DEPT_NAMES.items():
        text = text.replace(long_name, short_id)
    return text


def _extract_prerequisites(body: str) -> list[str]:
    """Extract prerequisite course IDs from body text."""
    prereq_match = re.search(r"Prerequisite:\s*(.+?)(?:Corequisite|$)", body, re.IGNORECASE)
    if not prereq_match:
        return []
    text = _normalize_dept_names(prereq_match.group(1))
    result = []
    for cid in re.findall(r"((?:ECE|M|PHY|C S|CS|BME|RHE|E|GOV|HIS|UGS)\s+\d+[A-Z]*)", text):
        cid = cid.replace("CS ", "C S ")
        if cid not in result:
            result.append(cid)
    return result


def _extract_corequisites(body: str) -> list[str]:
    """Extract corequisite course IDs from body text."""
    result = []

    # Format 1: Explicit "Corequisite:" section
    coreq_match = re.search(r"Corequisite:\s*(.+?)(?:Prerequisite|$)", body, re.IGNORECASE)
    if coreq_match:
        text = _normalize_dept_names(coreq_match.group(1))
        for cid in re.findall(r"((?:ECE|M|PHY|C S|CS|BME)\s+\d+[A-Z]*)", text):
            cid = cid.replace("CS ", "C S ")
            if cid not in result:
                result.append(cid)

    # Format 2: "registration for [Course]" within prerequisite text
    # This is how UT catalog expresses corequisites
    reg_matches = re.findall(
        r"registration for\s+(.+?)(?:\.|;|,\s*and\b|\band\b)",
        body, re.IGNORECASE,
    )
    for reg_text in reg_matches:
        reg_text = _normalize_dept_names(reg_text)
        for cid in re.findall(r"((?:ECE|M|PHY|C S|CS|BME)\s+\d+[A-Z]*)", reg_text):
            cid = cid.replace("CS ", "C S ")
            if cid not in result:
                result.append(cid)

    return result


def _extract_description(body: str) -> str:
    """Extract the course description (text before prerequisites/offering info)."""
    # Cut at "Prerequisite:", "Only one of the following", "Offered on", or "May be repeated"
    for marker in [
        r"Only one of the following",
        r"Prerequisite:",
        r"Corequisite:",
        r"Offered on the",
        r"May be repeated",
        r"\d+ and \d+ may not both be counted",
    ]:
        m = re.search(marker, body, re.IGNORECASE)
        if m:
            body = body[: m.start()]
            break
    return _clean(body)[:500]  # cap at 500 chars


def extract_all(output_path: Optional[Path] = None) -> dict:
    """
    Extract course catalog from all corpus files.
    Returns dict keyed by course ID.
    """
    catalog = {}

    # ECE courses
    ece_path = CORPUS_DIR / "ECE_catalog_web.txt"
    if ece_path.exists():
        text = ece_path.read_text(encoding="utf-8", errors="replace")
        for course in parse_ece_catalog(text):
            catalog[course["id"]] = course

    # Math courses
    math_path = CORPUS_DIR / "Math_Catalog_web.txt"
    if math_path.exists():
        text = math_path.read_text(encoding="utf-8", errors="replace")
        for course in parse_math_catalog(text):
            catalog[course["id"]] = course

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)

    return catalog


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent.parent / "data" / "course-catalog.json"
    catalog = extract_all(out)
    print(f"Extracted {len(catalog)} courses to {out}")
    # Show sample
    for cid in sorted(catalog.keys())[:10]:
        c = catalog[cid]
        print(f"  {cid}: {c['title']} ({c['credits']} cr) prereqs={c['prerequisites']}")
