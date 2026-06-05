"""Render image-based PDFs to PNG for visual inspection.
Only processes PDFs that yielded < 500 chars of text."""

import os
import fitz  # PyMuPDF

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "scraped_data_corpus")
TXT_DIR = os.path.join(CORPUS_DIR, "txt")
IMG_DIR = os.path.join(CORPUS_DIR, "images")
os.makedirs(IMG_DIR, exist_ok=True)

# Only process PDFs that had minimal text extraction
for fname in sorted(os.listdir(CORPUS_DIR)):
    if not fname.lower().endswith(".pdf"):
        continue
    
    base = os.path.splitext(fname)[0]
    txt_path = os.path.join(TXT_DIR, f"{base}.txt")
    
    # Check if text extraction was poor
    if os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            content = f.read().replace("--- PAGE ", "").strip()
            # Remove page markers and whitespace to get actual content
            actual_text = "".join(c for c in content if c.isalnum())
            if len(actual_text) > 100:
                continue  # Good text extraction, skip
    
    # Render each page as PNG
    pdf_path = os.path.join(CORPUS_DIR, fname)
    doc = fitz.open(pdf_path)
    for page_num, page in enumerate(doc, 1):
        pix = page.get_pixmap(dpi=200)
        img_path = os.path.join(IMG_DIR, f"{base}_page{page_num}.png")
        pix.save(img_path)
        print(f"  {fname} page {page_num} -> {os.path.basename(img_path)}")
    doc.close()

print(f"\nImages saved to: {IMG_DIR}")
print(f"Total PNGs: {len(os.listdir(IMG_DIR))}")
