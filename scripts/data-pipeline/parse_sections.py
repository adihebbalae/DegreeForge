"""
Parse OCR'd schedule text files into fall-2026-sections.json.
Extracts course sections from UT Austin registrar search result pages.
"""
import json
import os
import re


def parse_schedule_file(filepath: str) -> list[dict]:
    """Parse a single OCR'd schedule file into a list of section records."""
    text = open(filepath, encoding="utf-8").read()

    # Remove page boundaries — parse as continuous stream
    text = re.sub(r"^---\s+\S+\.png\s+---$", "", text, flags=re.MULTILINE)

    return _parse_text(text)


def _parse_text(page_text: str) -> list[dict]:
    """Parse OCR'd schedule text into section records (continuous stream)."""
    lines = page_text.split("\n")
    sections = []
    current_course = None
    current_section = None
    current_field = None  # Track which multi-line field we're in

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        # Skip header/footer/navigation text
        if _is_noise(line):
            continue

        # Match course header: "ECE 302 INTRO ELECTRICAL ENGINEERING"
        course_match = re.match(
            r"^((?:ECE|M)\s+\d+\w*(?:H)?)\s+(.+)$", line
        )
        if course_match:
            dept_num = course_match.group(1).strip()
            title = course_match.group(2).strip()
            # Normalize department + number
            dept_num = re.sub(r"\s+", " ", dept_num)
            current_course = {"department_number": dept_num, "title": title}
            current_field = None
            continue

        if not current_course:
            continue

        # Match "Unique: 12345"
        unique_match = re.match(r"^Unique:\s*(\d+)", line)
        if unique_match:
            # Save previous section
            if current_section:
                _finalize_section(current_section)
                sections.append(current_section)

            current_section = {
                "course": current_course["department_number"],
                "course_title": current_course["title"],
                "unique": int(unique_match.group(1)),
                "days": [],
                "hours": [],
                "rooms": [],
                "instruction_mode": "",
                "instructor": "",
                "status": "",
                "core": "",
            }
            current_field = None
            continue

        if not current_section:
            continue

        # Match labeled fields
        if line.startswith("Days:"):
            val = line[len("Days:"):].strip()
            if val:
                current_section["days"].append(val)
            current_field = "days"
            continue

        if line.startswith("Hour:"):
            val = line[len("Hour:"):].strip()
            if val:
                current_section["hours"].append(val)
            current_field = "hours"
            continue

        if line.startswith("Room:"):
            val = line[len("Room:"):].strip()
            if val:
                current_section["rooms"].append(val)
            current_field = "rooms"
            continue

        if line.startswith("Instruction") and i < len(lines):
            # "Instruction" on one line, "Mode: ..." on next
            next_line = lines[i].strip() if i < len(lines) else ""
            if next_line.startswith("Mode:"):
                current_section["instruction_mode"] = next_line[len("Mode:"):].strip()
                i += 1
            elif "Mode:" in line:
                current_section["instruction_mode"] = line.split("Mode:", 1)[1].strip()
            current_field = None
            continue

        if line.startswith("Mode:"):
            current_section["instruction_mode"] = line[len("Mode:"):].strip()
            current_field = None
            continue

        if line.startswith("Instructor:"):
            current_section["instructor"] = line[len("Instructor:"):].strip()
            current_field = None
            continue

        if line.startswith("Status:"):
            current_section["status"] = line[len("Status:"):].strip()
            current_field = None
            continue

        if line.startswith("Core:"):
            current_section["core"] = line[len("Core:"):].strip()
            current_field = None
            continue

        # Handle continuation lines for multi-line fields
        if current_field == "days" and re.match(r"^[MTWFS]+$", line):
            current_section["days"].append(line)
            continue

        if current_field == "hours" and re.match(r"^\d+:\d+\s", line):
            current_section["hours"].append(line)
            continue

        if current_field == "rooms" and re.match(r"^[A-Z]{2,}", line):
            current_section["rooms"].append(line)
            continue

    # Don't forget the last section
    if current_section:
        _finalize_section(current_section)
        sections.append(current_section)

    return sections


def _finalize_section(section: dict) -> None:
    """Clean up and normalize a section record."""
    # Merge multi-component times into meeting patterns
    meetings = []
    n = max(len(section["days"]), len(section["hours"]), len(section["rooms"]))
    for j in range(n):
        meeting = {}
        if j < len(section["days"]):
            meeting["days"] = _normalize_days(section["days"][j])
        if j < len(section["hours"]):
            meeting["time"] = section["hours"][j]
        if j < len(section["rooms"]):
            meeting["room"] = section["rooms"][j]
        if meeting:
            meetings.append(meeting)

    section["meetings"] = meetings
    # Remove raw arrays
    del section["days"]
    del section["hours"]
    del section["rooms"]

    # Normalize instructor name
    name = section["instructor"]
    if name and "," in name:
        parts = name.split(",", 1)
        section["instructor"] = f"{parts[1].strip()} {parts[0].strip()}"
    section["instructor"] = section["instructor"].title()


def _normalize_days(raw: str) -> str:
    """Normalize OCR'd day abbreviations."""
    raw = raw.strip().upper()
    # Handle common OCR issues
    raw = raw.replace("TH", "Th")
    # Map full words if present
    day_map = {"M": "M", "T": "T", "W": "W", "TH": "Th", "F": "F", "S": "S"}
    # If it's a simple string like "MW", "TTH", "MWF"
    if re.match(r"^[MTWFS]+$", raw):
        result = ""
        i = 0
        while i < len(raw):
            if i + 1 < len(raw) and raw[i:i+2] == "TH":
                result += "Th"
                i += 2
            else:
                result += raw[i]
                i += 1
        return result
    return raw


def _is_noise(line: str) -> bool:
    """Check if line is header/footer/navigation noise."""
    noise_patterns = [
        r"^\d+/\d+/\d+",  # date like 4/5/26
        r"^https?://",  # URLs
        r"^\d+/\d+$",  # page numbers like 1/13
        r"^UT Austin Registrar",
        r"^Fall 2026 Search",
        r"^Searching by field",
        r"^Refine your search",
        r"^Sections\s+Terms",
        r"^O\s+Open sections",
        r"^Primarily web-based",
        r"^Modify your search",
        r"^ECE\s*-\s*Electrical",
        r"^M\s*-\s*Mathematics",
        r"^IDA\s+2\.0",
        r"^Register$",
        r"^Past CVs",
        r"^How to register",
        r"^Click on a unique",
        r"^Next page",
        r"^Lower|^Upper",
        r"^\(Search",
        r"^Discounted$",
        r"^Fall term",
        r"^Winter term",
        r"^©",
    ]
    for p in noise_patterns:
        if re.search(p, line, re.IGNORECASE):
            return True
    return False


def build_sections_json(sections: list[dict], output_path: str) -> dict:
    """Build fall-2026-sections.json from parsed sections."""
    # Group by course
    courses: dict[str, dict] = {}
    for sec in sections:
        key = sec["course"]
        if key not in courses:
            courses[key] = {
                "course": key,
                "title": sec["course_title"],
                "sections": [],
            }
        courses[key]["sections"].append({
            "unique": sec["unique"],
            "meetings": sec["meetings"],
            "instruction_mode": sec["instruction_mode"],
            "instructor": sec["instructor"],
            "status": sec["status"],
            "core": sec["core"],
        })

    # Deduplicate courses with alternate numbers (ECE 302/402)
    # Keep both entries — the planner needs to know both numbers
    result = {
        "semester": "Fall 2026",
        "semester_code": "20269",
        "source": "OCR'd from utdirect.utexas.edu course search PDFs",
        "courses": courses,
        "total_courses": len(courses),
        "total_sections": sum(len(c["sections"]) for c in courses.values()),
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    return result


if __name__ == "__main__":
    proj_root = os.path.dirname(os.path.abspath(__file__))
    txt_dir = os.path.join(proj_root, "scraped_data_corpus", "txt")

    schedule_files = [
        os.path.join(txt_dir, "2026_ece_courses_lower_div_page1.txt"),
        os.path.join(txt_dir, "2026_ece_courses_lower_div_page2.txt"),
        os.path.join(txt_dir, "2026_ece_courses_lower_div_page3.txt"),
        os.path.join(txt_dir, "2026_ece_courses_lower_div_page4.txt"),
        os.path.join(txt_dir, "2026_ece_courses_upper_div_page1.txt"),
        os.path.join(txt_dir, "2026_ece_courses_upper_div_page2.txt"),
        os.path.join(txt_dir, "2026_ece_courses_upper_div_page3.txt"),
        os.path.join(txt_dir, "math_courses_upper_div_page1.txt"),
    ]

    all_sections = []
    for f in schedule_files:
        if os.path.exists(f):
            sections = parse_schedule_file(f)
            print(f"{os.path.basename(f)}: {len(sections)} sections")
            all_sections.extend(sections)
        else:
            print(f"MISSING: {f}")

    print(f"\nTotal sections parsed: {len(all_sections)}")

    output = os.path.join(proj_root, "data", "fall-2026-sections.json")
    result = build_sections_json(all_sections, output)
    print(f"Output: {result['total_courses']} courses, {result['total_sections']} sections → {output}")
