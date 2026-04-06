"""OCR the schedule page images using Tesseract."""
import os
import re
from collections import defaultdict

import pytesseract
from PIL import Image

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

IMAGES_DIR = os.path.join("scraped_data_corpus", "images")
TXT_DIR = os.path.join("scraped_data_corpus", "txt")

# Only process schedule pages (not catalog pages which have web versions)
SCHEDULE_PREFIXES = [
    "2026_ece_courses_lower_div_page1_page",
    "2026_ece_courses_lower_div_page2_page",
    "2026_ece_courses_lower_div_page3_page",
    "2026_ece_courses_lower_div_page4_page",
    "math_courses_upper_div_page1_page",
]

# Map image prefix -> output txt filename
PREFIX_TO_TXT = {
    "2026_ece_courses_lower_div_page1_page": "2026_ece_courses_lower_div_page1.txt",
    "2026_ece_courses_lower_div_page2_page": "2026_ece_courses_lower_div_page2.txt",
    "2026_ece_courses_lower_div_page3_page": "2026_ece_courses_lower_div_page3.txt",
    "2026_ece_courses_lower_div_page4_page": "2026_ece_courses_lower_div_page4.txt",
    "math_courses_upper_div_page1_page": "math_courses_upper_div_page1.txt",
}


def extract_page_num(filename, prefix):
    """Extract page number from filename like prefix_12.png -> 12."""
    m = re.search(rf"{re.escape(prefix)}(\d+)\.png$", filename)
    return int(m.group(1)) if m else 0


def main():
    os.makedirs(TXT_DIR, exist_ok=True)

    # Group images by prefix
    groups = defaultdict(list)
    for fname in os.listdir(IMAGES_DIR):
        if not fname.endswith(".png"):
            continue
        for prefix in SCHEDULE_PREFIXES:
            if fname.startswith(prefix):
                groups[prefix].append(fname)
                break

    total_images = sum(len(v) for v in groups.values())
    print(f"Found {total_images} schedule images across {len(groups)} groups")

    processed = 0
    for prefix in SCHEDULE_PREFIXES:
        if prefix not in groups:
            print(f"  SKIP {prefix} — no images found")
            continue

        images = sorted(groups[prefix], key=lambda f: extract_page_num(f, prefix))
        out_file = os.path.join(TXT_DIR, PREFIX_TO_TXT[prefix])
        print(f"\n  Processing {prefix} ({len(images)} pages) -> {out_file}")

        all_text = []
        for img_name in images:
            img_path = os.path.join(IMAGES_DIR, img_name)
            img = Image.open(img_path)
            text = pytesseract.image_to_string(img, lang="eng")
            all_text.append(f"--- {img_name} ---\n{text}")
            processed += 1
            print(f"    [{processed}/{total_images}] {img_name}: {len(text)} chars")

        combined = "\n".join(all_text)
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(combined)
        print(f"  Wrote {len(combined)} chars to {out_file}")

    print(f"\nDone. Processed {processed} images.")


if __name__ == "__main__":
    main()
