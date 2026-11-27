# MergeLens Frontend

Maintainer web interface for retrieving GitHub pull requests (title and description) and requesting binary merge-outcome predictions from the MergeLens inference service.

## Features

- **GitHub PR retrieval:** Load public PRs by full GitHub URL (`https://github.com/owner/repo/pull/123`), shorthand (`owner/repo#123`), or by browsing open PRs of a public repository (`owner/repo`).
- **Text-only baseline enforcement:** Displays the retrieved title and description and sends strictly `{ title, description }` to the inference API (no source code, diffs, or contributor features).
- **Prediction & probability display:** Shows predicted class (`Likely Merged` / `Likely Closed Without Merge`), probability score gauge, model version, measured latency, and an explicit maintainer triage disclaimer.
- **Session triage queue:** Ranks evaluated PRs by merge probability within the active browser session.
- **Live & Demo modes:** Connects to a FastAPI inference service via `VITE_INFERENCE_API_URL`, or runs a clearly labeled local placeholder mode (`VITE_INFERENCE_MODE=mock`) while the fine-tuned model service is in development.

## Proposed Inference API Contract

When `VITE_INFERENCE_MODE=live`, the frontend calls:

- **Endpoint:** `POST ${VITE_INFERENCE_API_URL}/predict`
- **Request JSON:**
  ```json
  {
    "title": "fix(parser): handle empty pull request body",
    "description": "Adds null-safe fallback for empty descriptions. Fixes #42."
  }
  ```
- **Expected Response JSON:**
  ```json
  {
    "predicted_class": "merged",
    "merge_probability": 0.81,
    "model_version": "distilbert-mergelens-v1",
    "latency_ms": 42.5
  }
  ```

## Local Development

Prerequisites: Node.js 22+ and npm 10+.

```bash
cd sys-src/frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

## Quality Checks & Tests

```bash
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

## Docker Build & Compose

Build standalone image:

```bash
docker build -t mergelens-frontend ./sys-src/frontend
docker run --rm -p 3000:80 mergelens-frontend
```

Or run via Compose from `sys-src/`:

```bash
docker compose up --build frontend
```
