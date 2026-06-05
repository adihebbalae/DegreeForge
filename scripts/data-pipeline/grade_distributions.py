"""
Download and parse UT Austin grade distributions from the Tableau dashboard.
Python reimplementation of UT_Grade_Parser (Rust).

Source: https://iq-analytics.austin.utexas.edu/views/Gradedistributiondashboard/
"""
import csv
import io
import json
import os
import sys
from collections import defaultdict

import requests
from bs4 import BeautifulSoup

BASE = "https://iq-analytics.austin.utexas.edu"
VIZ_PATH = "/vizql/w/Gradedistributiondashboard/v/Externaldashboard-Crosstab"

GRADE_NAMES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "Other"]


def get_session_id(session: requests.Session) -> str:
    # Use literal :embed=y (not URL-encoded %3A) to avoid double-encoding
    url = f"{BASE}/views/Gradedistributiondashboard/Externaldashboard-Crosstab?:embed=y&:isGuestRedirectFromVizportal=n"
    r = session.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    container = soup.find(id="tsConfigContainer")
    if not container:
        raise RuntimeError("Could not find tsConfigContainer on page")
    config = json.loads(container.string)
    return config["sessionid"]


def bootstrap(session: requests.Session, sid: str) -> None:
    url = f"{BASE}{VIZ_PATH}/bootstrapSession/sessions/{sid}"
    session.post(
        url,
        data="sheet_id=External%20dashboard-Crosstab",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )


def get_sheet_doc_id(session: requests.Session, sid: str) -> str:
    url = f"{BASE}{VIZ_PATH}/sessions/{sid}/commands/tabsrv/export-crosstab-server-dialog"
    thumb = json.dumps({
        "External dashboard-Crosstab": "/thumb/views/Gradedistributiondashboard/Externaldashboard-Crosstab",
        "External dashboard-bar graph": "/thumb/views/Gradedistributiondashboard/Externaldashboard-bargraph",
    })
    r = session.post(url, files={"thumbnailUris": (None, thumb)}, timeout=30)
    data = r.json()
    items = (
        data["vqlCmdResponse"]["layoutStatus"]["applicationPresModel"]
        ["presentationLayerNotification"][0]["presModelHolder"]
        ["genExportCrosstabOptionsDialogPresModel"]["thumbnailSheetPickerItems"]
    )
    return items[0]["sheetdocId"]


def categorical_filter_all(session: requests.Session, sid: str, field: str) -> None:
    url = f"{BASE}{VIZ_PATH}/sessions/{sid}/commands/tabdoc/categorical-filter"
    gfn = f"[sqlproxy.1nikk2j199ysrw13cof5d1qn00ff].[none:{field}:nk]"
    session.post(url, files={
        "visualIdPresModel": (None, '{"worksheet":"Grade distribution - external","dashboard":"External dashboard-Crosstab"}'),
        "membershipTarget": (None, "filter"),
        "globalFieldName": (None, gfn),
        "filterValues": (None, "[]"),
        "filterUpdateType": (None, "filter-all"),
    }, timeout=30)


def categorical_filter_index(session: requests.Session, sid: str, field: str, idx: int) -> None:
    url = f"{BASE}{VIZ_PATH}/sessions/{sid}/commands/tabdoc/categorical-filter-by-index"
    gfn = f"[sqlproxy.1nikk2j199ysrw13cof5d1qn00ff].[none:{field}:nk]"
    session.post(url, files={
        "visualIdPresModel": (None, '{"worksheet":"Grade distribution - external","dashboard":"External dashboard-Crosstab"}'),
        "membershipTarget": (None, "filter"),
        "globalFieldName": (None, gfn),
        "filterIndices": (None, f"[{idx}]"),
        "filterUpdateType": (None, "filter-replace"),
    }, timeout=30)


def set_expanded_values(session: requests.Session, sid: str) -> None:
    url = f"{BASE}{VIZ_PATH}/sessions/{sid}/commands/tabdoc/set-parameter-value"
    session.post(url, files={
        "globalFieldName": (None, "[Parameters].[Parameter 1]"),
        "valueString": (None, "Expanded"),
        "useUsLocale": (None, "false"),
    }, timeout=30)


def export_csv_bytes(session: requests.Session, sid: str, sheet_doc_id: str) -> bytes:
    url = f"{BASE}{VIZ_PATH}/sessions/{sid}/commands/tabsrv/export-crosstab-to-csvserver"
    r = session.post(url, files={
        "sheetdocId": (None, sheet_doc_id),
        "useTabs": (None, "false"),
        "sendNotifications": (None, "false"),
    }, timeout=60)
    data = r.json()
    result_key = data["vqlCmdResponse"]["cmdResultList"][0]["commandReturn"]["exportResult"]["resultKey"]

    dl_url = f"{BASE}{VIZ_PATH}/tempfile/sessions/{sid}/?key={result_key}"
    r2 = session.get(dl_url, timeout=60)
    return r2.content


def download_all_csvs(out_dir: str = "out") -> None:
    os.makedirs(out_dir, exist_ok=True)
    s = requests.Session()

    print("[1/5] Getting session ID...")
    sid = get_session_id(s)
    print(f"  Session: {sid[:20]}...")

    print("[2/5] Bootstrapping session...")
    bootstrap(s, sid)

    print("[3/5] Setting filters (all semesters, all courses)...")
    categorical_filter_all(s, sid, "Calculation_3161245480939225089")
    categorical_filter_all(s, sid, "COURSE_PREFIX")

    print("[4/5] Setting expanded values...")
    set_expanded_values(s, sid)

    sheet_doc_id = get_sheet_doc_id(s, sid)

    years = 13  # 2010-2011 to 2022-2023
    print(f"[5/5] Downloading {years} CSV files...")
    for i in range(years):
        label = f"{2010 + i}-{2011 + i}"
        print(f"  {label} ({i+1}/{years})...", end=" ", flush=True)
        categorical_filter_index(s, sid, "ACADEMIC_YEAR_SPAN", i)
        raw = export_csv_bytes(s, sid, sheet_doc_id)
        path = os.path.join(out_dir, f"grade_distributions_{label}.csv")
        with open(path, "wb") as f:
            f.write(raw)
        print(f"{len(raw):,} bytes")

    print("Done downloading.")


def parse_csv_file(input_path: str) -> list[dict]:
    """Parse a grade distribution CSV into aggregated per-section records.

    CSV columns: Semester, Section Number, Course Prefix, Course Number,
                 Course Title, Course, Letter Grade, Count of letter grade,
                 Department/Program

    Each row is one grade bucket for one section. We aggregate all grade
    rows for the same (semester, section, course) into a single record.
    """
    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        records: dict[str, dict] = {}
        for row in reader:
            semester = row["Semester"]
            section = row["Section Number"].strip()
            prefix = row["Course Prefix"].strip()
            number = row["Course Number"].strip()
            title = row["Course Title"].strip()
            grade = row["Letter Grade"].strip()
            dept = row["Department/Program"].strip()
            count_str = row["Count of letter grade"].replace(",", "")
            try:
                count = int(count_str)
            except ValueError:
                continue

            key = f"{semester}|{prefix}|{number}|{section}"
            if key not in records:
                records[key] = {
                    "semester": semester,
                    "section": int(section) if section.isdigit() else 0,
                    "department": dept,
                    "department_code": prefix,
                    "course_number": number,
                    "course_title": title,
                    "grades": {g: 0 for g in GRADE_NAMES},
                }
            if grade in records[key]["grades"]:
                records[key]["grades"][grade] += count

    return list(records.values())


def parse_all_csvs(in_dir: str = "out") -> list[dict]:
    """Parse all downloaded CSVs and return combined records."""
    all_records = []
    files = sorted(f for f in os.listdir(in_dir) if f.endswith(".csv"))
    for fname in files:
        path = os.path.join(in_dir, fname)
        records = parse_csv_file(path)
        all_records.extend(records)
        print(f"  {fname}: {len(records)} sections")
    return all_records


def build_grade_distributions_json(records: list[dict], output_path: str, departments: set[str] | None = None) -> dict:
    """
    Build grade-distributions.json from parsed records.

    Groups by course → list of section entries with grades, GPA, enrollment.
    Also computes per-course aggregate stats (avg GPA, grade percentages).
    """
    course_data: dict[str, dict] = {}

    for rec in records:
        dept = rec["department_code"]
        if departments and dept not in departments:
            continue

        course_key = f"{dept} {rec['course_number']}"
        grades = rec["grades"]
        total = sum(grades.values())
        if total == 0:
            continue

        if course_key not in course_data:
            course_data[course_key] = {
                "department": rec["department"],
                "department_code": dept,
                "course_number": rec["course_number"],
                "course_title": rec["course_title"],
                "sections": [],
            }

        a_count = grades.get("A+", 0) + grades.get("A", 0) + grades.get("A-", 0)
        b_count = grades.get("B+", 0) + grades.get("B", 0) + grades.get("B-", 0)
        c_count = grades.get("C+", 0) + grades.get("C", 0) + grades.get("C-", 0)
        d_count = grades.get("D+", 0) + grades.get("D", 0) + grades.get("D-", 0)
        f_count = grades.get("F", 0)

        course_data[course_key]["sections"].append({
            "semester": rec["semester"],
            "section": rec["section"],
            "grades": grades,
            "a_pct": round(a_count / total * 100, 1),
            "b_pct": round(b_count / total * 100, 1),
            "c_pct": round(c_count / total * 100, 1),
            "d_pct": round(d_count / total * 100, 1),
            "f_pct": round(f_count / total * 100, 1),
            "enrollment": total,
            "gpa": _compute_gpa(grades),
        })

    # Sort sections by semester within each course, compute course-level aggregates
    for course in course_data.values():
        course["sections"].sort(key=lambda s: s["semester"])
        total_enrolled = sum(s["enrollment"] for s in course["sections"])
        if total_enrolled > 0:
            weighted_gpa = sum(s["gpa"] * s["enrollment"] for s in course["sections"]) / total_enrolled
            course["avg_gpa"] = round(weighted_gpa, 3)
            course["a_pct"] = round(sum(s["a_pct"] * s["enrollment"] for s in course["sections"]) / total_enrolled, 1)
            course["b_pct"] = round(sum(s["b_pct"] * s["enrollment"] for s in course["sections"]) / total_enrolled, 1)
            course["c_pct"] = round(sum(s["c_pct"] * s["enrollment"] for s in course["sections"]) / total_enrolled, 1)
            course["d_pct"] = round(sum(s["d_pct"] * s["enrollment"] for s in course["sections"]) / total_enrolled, 1)
            course["f_pct"] = round(sum(s["f_pct"] * s["enrollment"] for s in course["sections"]) / total_enrolled, 1)
        else:
            course["avg_gpa"] = 0.0
        course["total_enrollment"] = total_enrolled
        course["total_sections"] = len(course["sections"])

    result = {"courses": course_data, "total_courses": len(course_data)}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    return result


def _compute_gpa(grades: dict[str, int]) -> float:
    """Compute GPA from grade distribution (4.0 scale)."""
    gpa_map = {
        "A+": 4.0, "A": 4.0, "A-": 3.67,
        "B+": 3.33, "B": 3.0, "B-": 2.67,
        "C+": 2.33, "C": 2.0, "C-": 1.67,
        "D+": 1.33, "D": 1.0, "D-": 0.67,
        "F": 0.0,
    }
    total_points = 0.0
    total_students = 0
    for grade, count in grades.items():
        if grade in gpa_map:
            total_points += gpa_map[grade] * count
            total_students += count
    return round(total_points / total_students, 3) if total_students > 0 else 0.0


if __name__ == "__main__":
    proj_root = os.path.dirname(os.path.abspath(__file__))
    csv_dir = os.path.join(proj_root, "utgradesdist_21-26")

    if "--download" in sys.argv:
        download_all_csvs(csv_dir)

    if "--parse" in sys.argv or "--all" in sys.argv:
        print("Parsing CSVs...")
        records = parse_all_csvs(csv_dir)
        print(f"Total sections parsed: {len(records)}")

        # Filter to ECE + Math departments
        target_depts = {"E E", "M", "ECE"}  # UT uses "E E" for ECE, "M" for Math
        output = os.path.join(proj_root, "data", "grade-distributions.json")
        result = build_grade_distributions_json(records, output, target_depts)
        print(f"Grade distributions JSON: {result['total_courses']} courses → {output}")

    if "--placeholder" in sys.argv:
        # Create a placeholder with correct schema for V1
        output = os.path.join(proj_root, "data", "grade-distributions.json")
        placeholder = {
            "courses": {},
            "total_courses": 0,
            "_note": "Placeholder. Run --parse after downloading CSVs from the Tableau dashboard.",
            "_manual_download_instructions": [
                "1. Open https://iq-analytics.austin.utexas.edu/views/Gradedistributiondashboard/Externaldashboard-Crosstab",
                "2. Set 'Select grade level of detail' to 'Expanded'",
                "3. For each Academic Year (2010-2011 through 2024-2025):",
                "   a. Set Academic Year filter",
                "   b. Set Course Prefix to 'E E' (or 'ECE')",
                "   c. Click Download icon → Crosstab → Download",
                "   d. Repeat for Course Prefix 'M' (Mathematics)",
                "4. Save all CSVs to UT_Grade_Parser/out/",
                "5. Run: python grade_distributions.py --parse"
            ],
            "_schema": {
                "courses": {
                    "<course_key>": {
                        "department": "string",
                        "department_code": "string",
                        "course_number": "string",
                        "course_title": "string",
                        "sections": [
                            {
                                "semester": "string",
                                "section": "int",
                                "grades": {"A": 0, "A-": 0, "B+": 0, "...": 0},
                                "total_enrolled": "int",
                                "gpa": "float"
                            }
                        ]
                    }
                }
            }
        }
        with open(output, "w", encoding="utf-8") as f:
            json.dump(placeholder, f, indent=2)
        print(f"Created placeholder: {output}")

    if "--download" not in sys.argv and "--parse" not in sys.argv and "--all" not in sys.argv and "--placeholder" not in sys.argv:
        print("Usage: python grade_distributions.py [--download] [--parse] [--all] [--placeholder]")
        print("  --download     Download CSVs from Tableau dashboard (may require API update)")
        print("  --parse        Parse downloaded CSVs and build grade-distributions.json")
        print("  --all          Download + parse")
        print("  --placeholder  Create placeholder JSON with correct schema")
