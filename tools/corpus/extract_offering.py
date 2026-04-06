"""
Extract course offering schedule from the ECE Tech Elective Offering Schedule.
Enriches course-catalog.json with offering patterns (fall/spring).

Source: ECE Tech Elective Offering Schedule.txt
"""
import json
import re
from pathlib import Path
from typing import Optional

from .search import CORPUS_DIR


def parse_offering_schedule() -> dict[str, dict]:
    """
    Parse the ECE Tech Elective Offering Schedule into structured data.

    Returns dict keyed by course ID:
      {
        "ECE 325": {
          "title": "Electromagnetic Engineering",
          "offerings": {"fall_25": true, "spring_26": true, "fall_26": true, "spring_27": true},
          "offered_semesters": ["fall", "spring"]
        }
      }
    """
    path = CORPUS_DIR / "ECE Tech Elective Offering Schedule.txt"
    if not path.exists():
        return {}

    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    results = {}
    semesters = ["fall_25", "spring_26", "fall_26", "spring_27"]

    # The format is inconsistent — each course entry spans multiple lines:
    # Line 1: "325 - Electromagnetic Engineering"
    # Lines 2-5: "X" or empty for each semester
    # We need to parse this carefully.

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Match course line: "325 - Title" or "325K - Title" or "479K - Title"
        m = re.match(r"^(\d+[A-Z]*)\s*[-–]\s*(.+)$", line)
        if not m:
            # Also match "445S- Title" (no space before dash)
            m = re.match(r"^(\d+[A-Z]*)-\s*(.+)$", line)

        if m:
            course_num = m.group(1)
            title = m.group(2).strip()
            course_id = f"ECE {course_num}"

            # Read the next 4 lines for semester offerings
            offerings = {}
            for j, sem in enumerate(semesters):
                idx = i + 1 + j
                if idx < len(lines):
                    val = lines[idx].strip()
                    offerings[sem] = val.upper() == "X"
                else:
                    offerings[sem] = False

            # Determine general offering pattern
            has_fall = offerings.get("fall_25", False) or offerings.get("fall_26", False)
            has_spring = offerings.get("spring_26", False) or offerings.get("spring_27", False)
            offered = []
            if has_fall:
                offered.append("fall")
            if has_spring:
                offered.append("spring")

            results[course_id] = {
                "title": title,
                "offerings": offerings,
                "offered_semesters": offered,
            }

            i += 5  # Skip course line + 4 semester lines
        else:
            i += 1

    return results


# Core courses that are always offered both semesters (not in the elective schedule)
_ALWAYS_OFFERED = {
    "ECE 402": "Introduction to Electrical Engineering",
    "ECE 406": "Introduction to Computing",
    "ECE 411": "Circuit Theory",
    "ECE 412": "Software Design and Implementation I",
    "ECE 313": "Linear Systems and Signals",
    "ECE 419K": "Introduction to Embedded Systems",
    "ECE 333T": "Engineering Communication",
    "ECE 351K": "Probability and Random Processes",
    "ECE 364D": "Introduction to Engineering Design",
    "ECE 316": "Digital Logic Design",
    "ECE 422C": "Software Design & Implementation II",
    "ECE 460N": "Computer Architecture",
    "ECE 461L": "Software Engineering & Design Laboratory",
    # Math
    "M 408C": "Differential and Integral Calculus",
    "M 408D": "Sequences, Series, and Multivariable Calculus",
    "M 408K": "Differential Calculus",
    "M 408L": "Integral Calculus",
    "M 408M": "Multivariable Calculus",
    "M 427J": "Differential Equations with Linear Algebra",
    "M 427K": "Differential Equations with Linear Algebra",
    "M 427L": "Advanced Calculus for Applications II",
    "M 340L": "Matrices and Matrix Calculations",
    "M 325K": "Discrete Mathematics",
    # Physics
    "PHY 303K": "Engineering Physics I",
    "PHY 303L": "Engineering Physics II",
    "PHY 303E": "Electromagnetic/Quantum/Semiconductor Physics",
    "PHY 105M": "Laboratory for PHY 303K",
    "PHY 105N": "Laboratory for PHY 303L",
}


def extract_all(output_path: Optional[Path] = None) -> dict:
    """
    Extract the full offering schedule: tech electives + always-offered cores.
    Returns dict keyed by course ID.
    """
    schedule = parse_offering_schedule()

    # Add core courses
    for cid, title in _ALWAYS_OFFERED.items():
        if cid not in schedule:
            schedule[cid] = {
                "title": title,
                "offerings": {
                    "fall_25": True, "spring_26": True,
                    "fall_26": True, "spring_27": True,
                },
                "offered_semesters": ["fall", "spring"],
            }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(schedule, f, indent=2, ensure_ascii=False)

    return schedule


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent.parent / "data" / "offering-schedule.json"
    data = extract_all(out)
    print(f"Offering schedule: {len(data)} courses")

    # Show courses only offered in fall
    fall_only = [c for c, d in data.items() if d["offered_semesters"] == ["fall"]]
    spring_only = [c for c, d in data.items() if d["offered_semesters"] == ["spring"]]
    both = [c for c, d in data.items() if set(d["offered_semesters"]) == {"fall", "spring"}]
    neither = [c for c, d in data.items() if not d["offered_semesters"]]

    print(f"  Both semesters: {len(both)}")
    print(f"  Fall only: {len(fall_only)} — {fall_only}")
    print(f"  Spring only: {len(spring_only)} — {spring_only}")
    print(f"  Not offered 25-27: {len(neither)} — {neither}")
    print(f"\nSaved to {out}")
