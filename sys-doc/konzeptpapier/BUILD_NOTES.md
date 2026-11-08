# MergeLens Concept Paper — LaTeX source

This revision retains the original `cs-techrep.cls` and the supplied two-column academic layout.

## Project metadata

Title: **MergeLens: Predicting Pull Request Outcomes from Titles and Descriptions**

Authors (alphabetical by surname): **Timo Gräf, Maria Lyoteva, Dominik Schwagerl, Tsvetan Stanchev**.

## Build

From the project folder, run:

```bash
latexmk -pdf -interaction=nonstopmode -halt-on-error concept-paper.tex
```

The class uses `biblatex`/`biber`. `selfref.bib` is generated automatically during compilation. The optional bibliography name truncation is configured in `concept-paper.tex` to keep the document within the required page range. The class file itself is unmodified.

## Before submission

- Verify institutional department and exact report metadata from the course template.
- Confirm the final observation period, compute resources, data-processing library, database and model choice during implementation.
- The project components are proposed, not claimed as already implemented.
