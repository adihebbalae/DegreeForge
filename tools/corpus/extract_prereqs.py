"""
Extract the prerequisite graph from catalog data.
Outputs prerequisite-graph.json matching the PRD schema.

The graph is built from the extracted course catalog — each course's
prerequisites and corequisites become directed edges.
"""
import json
import re
from pathlib import Path
from typing import Optional

from .extract_courses import extract_all as extract_catalog, CORPUS_DIR


# Offering pattern data from ECE Tech Elective Offering Schedule
# and general catalog knowledge
_KNOWN_OFFERING = {
    # ECE core courses — offered every semester
    "ECE 302": ["fall", "spring"],
    "ECE 402": ["fall", "spring"],
    "ECE 306": ["fall", "spring"],
    "ECE 406": ["fall", "spring"],
    "ECE 411": ["fall", "spring"],
    "ECE 312": ["fall", "spring"],
    "ECE 412": ["fall", "spring"],
    "ECE 313": ["fall", "spring"],
    "ECE 319K": ["fall", "spring"],
    "ECE 419K": ["fall", "spring"],
    "ECE 333T": ["fall", "spring"],
    "ECE 351K": ["fall", "spring"],
    "ECE 364D": ["fall", "spring"],
    "ECE 316": ["fall", "spring"],
    # Math sequence — offered every semester
    "M 408C": ["fall", "spring"],
    "M 408D": ["fall", "spring"],
    "M 408K": ["fall", "spring"],
    "M 408L": ["fall", "spring"],
    "M 408M": ["fall", "spring"],
    "M 427J": ["fall", "spring"],
    "M 427K": ["fall", "spring"],
    "M 340L": ["fall", "spring"],
    "M 325K": ["fall", "spring"],
    "M 427L": ["fall", "spring"],
    # Physics — offered every semester
    "PHY 303K": ["fall", "spring"],
    "PHY 303L": ["fall", "spring"],
    "PHY 303E": ["fall", "spring"],
    "PHY 105M": ["fall", "spring"],
    "PHY 105N": ["fall", "spring"],
}


def build_graph(catalog: Optional[dict] = None) -> dict:
    """
    Build the prerequisite graph from the course catalog.

    Returns:
        {
          "nodes": { "ECE 302": { "title": ..., "credits": ..., ... } },
          "edges": [ { "from": ..., "to": ..., "type": "prerequisite"|"corequisite", "min_grade": ... } ]
        }
    """
    if catalog is None:
        catalog = extract_catalog()

    nodes = {}
    edges = []

    for cid, course in catalog.items():
        # Determine category
        category = _categorize(cid)
        offered = _KNOWN_OFFERING.get(cid, ["fall", "spring"])

        nodes[cid] = {
            "title": course["title"],
            "credits": course["credits"],
            "category": category,
            "offered": offered,
            "flags": [],
        }

        # Add prerequisite edges
        for prereq in course.get("prerequisites", []):
            # Only add edges for courses that exist in our catalog or are known
            edges.append({
                "from": prereq,
                "to": cid,
                "type": "prerequisite",
                "min_grade": "C-",
            })

        # Add corequisite edges
        for coreq in course.get("corequisites", []):
            edges.append({
                "from": coreq,
                "to": cid,
                "type": "corequisite",
                "min_grade": "C-",
            })

    return {"nodes": nodes, "edges": edges}


def _categorize(course_id: str) -> str:
    """Categorize a course for the graph."""
    ece_core = {
        "ECE 302", "ECE 402", "ECE 306", "ECE 406", "ECE 411",
        "ECE 312", "ECE 412", "ECE 313", "ECE 319K", "ECE 419K",
        "ECE 333T", "ECE 351K", "ECE 364D", "ECE 464K",
    }
    if course_id in ece_core:
        return "ece_core"
    if course_id.startswith("ECE"):
        num = re.search(r"\d+", course_id)
        if num and int(num.group()) >= 300:
            return "ece_upper"
        return "ece_lower"
    if course_id.startswith("M "):
        return "math"
    if course_id.startswith("PHY"):
        return "physics"
    return "other"


def extract_all(output_path: Optional[Path] = None) -> dict:
    """Extract prerequisite graph and optionally save to file."""
    catalog = extract_catalog()
    graph = build_graph(catalog)

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(graph, f, indent=2, ensure_ascii=False)

    return graph


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent.parent / "data" / "prerequisite-graph.json"
    graph = extract_all(out)
    print(f"Graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    print(f"Saved to {out}")

    # Show sample edges
    for edge in graph["edges"][:10]:
        print(f"  {edge['from']} -> {edge['to']} ({edge['type']})")
