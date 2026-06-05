# Data-pipeline scripts (archival)

One-shot data-extraction scripts that were used to build the JSON in
`packages/client/public/data/` from the source corpus. They are **not** part of the
app build or CI — kept for reproducibility only.

They require the gitignored `scraped_data_corpus/` (raw PDFs / CSVs / HTML), which is
not committed to this repo.

## Setup
```
pip install -r requirements.txt
```
`pytesseract` additionally needs the Tesseract OCR binary installed on the system.

## Scripts
- `convert_corpus.py` — corpus format conversion
- `grade_distributions.py` — parse UTGradesPlus CSVs → `grade-distributions.json`
- `ocr_schedules.py` — OCR schedule page images
- `render_image_pdfs.py` — render image-only PDFs. NOTE: its corpus path is hardcoded
  relative to the old repo-root location; fix the path before re-running now that the
  file lives under `scripts/data-pipeline/`.
- `parse_sections.py` — **SUPERSEDED** by the maintained TypeScript pipeline in
  `scripts/sections/` (`npm run fetch:sections`). Kept for reference only.

See also `tools/corpus/` for the course / degree-req / prereq / offering / tech-core extractors.
