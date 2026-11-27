# MergeLens Frontend — Architecture & Integration Guide

This document explains how the frontend works internally (for code walkthroughs) and what the backend/ML team needs to expose so the fine-tuned model plugs in without frontend code changes.

## 1. Component & Data Flow Overview

```text
GitHub REST API ──► githubApi.ts ──► App.tsx (state) ──► inferenceApi.ts ──► FastAPI /predict
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
         SessionAnalyticsBar        PrPreviewCard         PredictionPanel
           (KPI summary)         (Title + Description      (SVG Gauge +
                                  + Model JSON view)        Disclaimer)
```

### File Map (one responsibility per file)

| File | Responsibility |
| :--- | :--- |
| `src/types/pr.ts` | TypeScript interfaces for PR records, inference requests/responses, and session history. |
| `src/services/githubApi.ts` | Parses GitHub PR URLs/shorthands and fetches PR data or open PR lists from GitHub's REST API. Handles 401/403/404/429 and network errors. |
| `src/services/inferenceApi.ts` | Sends `{ title, description }` to `POST /predict`, checks `GET /health`, and provides a clearly labeled local Demo Mode (`mock`) while the backend is in progress. |
| `src/utils/formatters.ts` | Pure formatting helpers (probabilities, labels, dates, latency, word counts). |
| `src/components/Header.tsx` | Top bar with Live/Demo badge and collapsible Connection Settings (API URL, Health Test, in-memory GitHub token). |
| `src/components/SessionAnalyticsBar.tsx` | Live KPI cards across evaluated PRs (count, likely-merged ratio, average score, average latency). |
| `src/components/PrLoaderForm.tsx` | Single PR loader, quick example buttons, and repository open-PR browser with one-click **Evaluate All** batch triage. |
| `src/components/PrPreviewCard.tsx` | Displays retrieved PR metadata, text-only scope notice, empty/historical PR warnings, and a **Description / Model JSON** toggle. |
| `src/components/PredictionPanel.tsx` | Displays the predicted class, `ProbabilityGauge` (SVG), model version, measured latency, and the mandatory non-authority disclaimer. |
| `src/components/ProbabilityGauge.tsx` | Pure SVG semicircle gauge driven by `strokeDashoffset`. |
| `src/components/MergeLens3DCanvas.tsx` | Dependency-free real-time 3D canvas sphere (Fibonacci points + rotation matrix + perspective projection) reflecting the active prediction and orbiting session PRs. |
| `src/components/EvaluationHistory.tsx` | Filterable, score-ranked session triage queue. |
| `src/App.tsx` | Connects services and components; holds session state in memory. |

## 2. Backend Integration Contract (for ML / FastAPI Team)

To connect the real fine-tuned model, no frontend rewrite is needed. Set `VITE_INFERENCE_MODE=live` and `VITE_INFERENCE_API_URL=http://localhost:8000` (or switch to **Live Inference API** in Connection Settings).

### Required Endpoint: `POST /predict`

- **Request (`application/json`):**
  ```json
  {
    "title": "fix(parser): handle empty pull request body",
    "description": "Adds null-safe fallback for empty descriptions."
  }
  ```
- **Response (`200 OK`, `application/json`):**
  ```json
  {
    "predicted_class": "merged",
    "merge_probability": 0.81,
    "model_version": "distilbert-mergelens-v1",
    "latency_ms": 42.5
  }
  ```
  *(The frontend also accepts `prediction`/`label` (`0`/`1`/`"merged"`/`"closed"`) and `probability`/`score` as fallback field names.)*

### Optional Endpoint: `GET /health`

- Used by the **Test API** button in Connection Settings.
- Returns `200 OK`, optionally with `{ "status": "ok", "model_version": "..." }`.

### CORS Note for Local Browser Access

When the frontend runs in the browser on `http://localhost:3000` (Docker) or `http://localhost:5173` (Vite dev), the FastAPI service must enable CORS (`CORSMiddleware`) for those origins.
