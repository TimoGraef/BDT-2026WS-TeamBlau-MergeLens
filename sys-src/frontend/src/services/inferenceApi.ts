import type {
  InferenceMode,
  InferenceRequest,
  InferenceResult,
  PredictionClass,
} from '../types/pr';

export const DEFAULT_INFERENCE_API_URL =
  import.meta.env.VITE_INFERENCE_API_URL?.replace(/\/+$/, '') || 'http://localhost:8000';

export const DEFAULT_INFERENCE_MODE: InferenceMode =
  import.meta.env.VITE_INFERENCE_MODE === 'live' ? 'live' : 'mock';

export class InferenceApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'InferenceApiError';
    this.status = status;
  }
}

interface RawInferenceResponse {
  predicted_class?: string;
  prediction?: string | number;
  label?: string | number;
  merge_probability?: number;
  probability?: number;
  score?: number;
  model_version?: string;
  latency_ms?: number;
}

function normalizePredictedClass(raw: RawInferenceResponse, mergeProbability: number): PredictionClass {
  const candidate = raw.predicted_class ?? raw.prediction ?? raw.label;
  if (candidate === 1 || candidate === '1' || candidate === 'merged' || candidate === 'positive') {
    return 'merged';
  }
  if (
    candidate === 0 ||
    candidate === '0' ||
    candidate === 'closed' ||
    candidate === 'closed_without_merge' ||
    candidate === 'negative'
  ) {
    return 'closed_without_merge';
  }
  return mergeProbability >= 0.5 ? 'merged' : 'closed_without_merge';
}

function extractMergeProbability(raw: RawInferenceResponse): number {
  const value = raw.merge_probability ?? raw.probability ?? raw.score;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new InferenceApiError(
      'Inference API returned an invalid probability score. Expected a number between 0 and 1.',
    );
  }
  return value;
}

/**
 * Deterministic local demo evaluator used only when VITE_INFERENCE_MODE=mock
 * while the fine-tuned FastAPI inference service is still under development.
 * Uses only title and description text to match the text-only baseline contract.
 */
export function simulateLocalInference(request: InferenceRequest): InferenceResult {
  const started = performance.now();
  const title = request.title.trim();
  const description = request.description.trim();

  if (title.length === 0) {
    throw new InferenceApiError('Cannot evaluate a pull request without a title.');
  }

  let logit = -0.15;
  if (title.length >= 15 && title.length <= 90) {
    logit += 0.35;
  }
  if (/^(fix|feat|docs|refactor|test|chore|perf)(\(.+\))?:/i.test(title)) {
    logit += 0.45;
  }
  if (description.length >= 80) {
    logit += 0.55;
  } else if (description.length === 0) {
    logit -= 0.75;
  }
  if (/(fixes|closes|resolves)\s+#\d+/i.test(description)) {
    logit += 0.4;
  }
  if (/(test|tested|verification|reproduc)/i.test(description)) {
    logit += 0.35;
  }
  if (/\bwip\b|\bdo not merge\b|\bexperiment\b/i.test(`${title} ${description}`)) {
    logit -= 1.1;
  }

  const mergeProbability = Number((1 / (1 + Math.exp(-logit))).toFixed(4));
  const closedProbability = Number((1 - mergeProbability).toFixed(4));
  const predictedClass: PredictionClass =
    mergeProbability >= 0.5 ? 'merged' : 'closed_without_merge';

  return {
    predictedClass,
    mergeProbability,
    closedProbability,
    modelVersion: 'local-demo-heuristic-v0 (placeholder)',
    latencyMs: Math.max(1, performance.now() - started),
    mode: 'mock',
    evaluatedAt: new Date().toISOString(),
  };
}

export interface InferenceHealthStatus {
  ok: boolean;
  modelVersion?: string;
  latencyMs: number;
  message: string;
}

export async function checkInferenceHealth(
  apiBaseUrl: string = DEFAULT_INFERENCE_API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<InferenceHealthStatus> {
  const baseUrl = apiBaseUrl.replace(/\/+$/, '');
  const started = performance.now();

  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.max(1, performance.now() - started);

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Health check returned HTTP ${response.status}.`,
      };
    }

    let modelVersion: string | undefined;
    try {
      const body = (await response.json()) as { model_version?: string };
      modelVersion = body.model_version;
    } catch {
      // Plain-text 200 OK health endpoints are also valid.
    }

    return {
      ok: true,
      modelVersion,
      latencyMs,
      message: modelVersion
        ? `Connected (${modelVersion})`
        : 'Connected to inference service',
    };
  } catch {
    return {
      ok: false,
      latencyMs: Math.max(1, performance.now() - started),
      message: `Cannot reach ${baseUrl}/health`,
    };
  }
}

export async function evaluatePullRequest(
  request: InferenceRequest,
  options?: {
    mode?: InferenceMode;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<InferenceResult> {
  const mode = options?.mode ?? DEFAULT_INFERENCE_MODE;
  const payload: InferenceRequest = {
    title: request.title.trim(),
    description: request.description.trim(),
  };

  if (payload.title.length === 0) {
    throw new InferenceApiError('Pull request title is required for evaluation.');
  }

  if (mode === 'mock') {
    return simulateLocalInference(payload);
  }

  const baseUrl = (options?.apiBaseUrl || DEFAULT_INFERENCE_API_URL).replace(/\/+$/, '');
  const fetchFn = options?.fetchImpl || fetch;
  const started = performance.now();

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new InferenceApiError(
      `Could not reach the inference API at ${baseUrl}/predict. Verify the backend container is running or switch to Demo Mode.`,
    );
  }

  if (!response.ok) {
    throw new InferenceApiError(
      `Inference API returned HTTP ${response.status}. Check the inference service logs and request contract.`,
      response.status,
    );
  }

  const data = (await response.json()) as RawInferenceResponse;
  const mergeProbability = extractMergeProbability(data);
  const predictedClass = normalizePredictedClass(data, mergeProbability);
  const measuredLatency = performance.now() - started;

  return {
    predictedClass,
    mergeProbability,
    closedProbability: Number((1 - mergeProbability).toFixed(4)),
    modelVersion: data.model_version ?? 'unknown-model',
    latencyMs: typeof data.latency_ms === 'number' ? data.latency_ms : measuredLatency,
    mode: 'live',
    evaluatedAt: new Date().toISOString(),
  };
}
