import { describe, expect, it, vi } from 'vitest';
import {
  checkInferenceHealth,
  evaluatePullRequest,
  InferenceApiError,
  simulateLocalInference,
} from './inferenceApi';

describe('inferenceApi', () => {
  it('simulates higher merge probability for well-structured PR text than WIP empty PRs', () => {
    const strong = simulateLocalInference({
      title: 'fix(parser): handle empty PR description cleanly',
      description:
        'Adds null-safe fallback for empty descriptions and covers edge cases with unit tests. Fixes #42.',
    });

    const weak = simulateLocalInference({
      title: 'WIP experiment',
      description: '',
    });

    expect(strong.mode).toBe('mock');
    expect(strong.predictedClass).toBe('merged');
    expect(strong.mergeProbability).toBeGreaterThan(0.7);
    expect(weak.predictedClass).toBe('closed_without_merge');
    expect(weak.mergeProbability).toBeLessThan(0.3);
  });

  it('rejects empty titles before calling inference', async () => {
    await expect(
      evaluatePullRequest({ title: '   ', description: 'body' }, { mode: 'mock' }),
    ).rejects.toThrow(InferenceApiError);
  });

  it('calls the live FastAPI /predict endpoint with title and description only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          predicted_class: 'merged',
          merge_probability: 0.82,
          model_version: 'distilbert-mergelens-v1',
          latency_ms: 37.5,
        }),
        { status: 200 },
      ),
    );

    const result = await evaluatePullRequest(
      { title: 'feat: add endpoint', description: 'Implements /predict' },
      { mode: 'live', apiBaseUrl: 'http://inference:8000', fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://inference:8000/predict',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'feat: add endpoint',
          description: 'Implements /predict',
        }),
      }),
    );
    expect(result).toMatchObject({
      predictedClass: 'merged',
      mergeProbability: 0.82,
      closedProbability: 0.18,
      modelVersion: 'distilbert-mergelens-v1',
      latencyMs: 37.5,
      mode: 'live',
    });
  });

  it('handles live API errors and invalid probability responses', async () => {
    const unreachableFetch = vi.fn().mockRejectedValue(new TypeError('connection refused'));
    await expect(
      evaluatePullRequest(
        { title: 'fix: test', description: 'desc' },
        { mode: 'live', apiBaseUrl: 'http://localhost:8000', fetchImpl: unreachableFetch },
      ),
    ).rejects.toThrow(/Could not reach the inference API/i);

    const serverErrorFetch = vi.fn().mockResolvedValue(new Response('error', { status: 503 }));
    await expect(
      evaluatePullRequest(
        { title: 'fix: test', description: 'desc' },
        { mode: 'live', apiBaseUrl: 'http://localhost:8000', fetchImpl: serverErrorFetch },
      ),
    ).rejects.toThrow(/HTTP 503/);

    const badScoreFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ merge_probability: 1.5 }), { status: 200 }),
    );
    await expect(
      evaluatePullRequest(
        { title: 'fix: test', description: 'desc' },
        { mode: 'live', apiBaseUrl: 'http://localhost:8000', fetchImpl: badScoreFetch },
      ),
    ).rejects.toThrow(/invalid probability score/i);
  });

  it('checks inference service health for healthy, failing, and unreachable endpoints', async () => {
    const okFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', model_version: 'bert-v1' }), { status: 200 }),
    );
    const healthy = await checkInferenceHealth('http://localhost:8000', okFetch);
    expect(healthy.ok).toBe(true);
    expect(healthy.modelVersion).toBe('bert-v1');

    const failFetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const failing = await checkInferenceHealth('http://localhost:8000', failFetch);
    expect(failing.ok).toBe(false);

    const netFetch = vi.fn().mockRejectedValue(new TypeError('refused'));
    const offline = await checkInferenceHealth('http://localhost:8000', netFetch);
    expect(offline.ok).toBe(false);
  });
});
