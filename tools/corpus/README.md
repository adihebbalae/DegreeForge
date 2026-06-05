# Corpus extractors (archival)

One-shot Python package that extracted the structured JSON (course-catalog,
degree-requirements, prerequisite-graph, offering-schedule, tech-cores) from the source
corpus into `packages/client/public/data/`. **Not** part of the app build or CI — kept
for reproducibility only.

Requires the gitignored `scraped_data_corpus/`. Dependencies are listed in
`../../scripts/data-pipeline/requirements.txt` (beautifulsoup4, PyMuPDF, openpyxl,
Pillow, pytesseract, requests).

Run: `python -m tools.corpus <command>` — see `__main__.py` for available commands.
