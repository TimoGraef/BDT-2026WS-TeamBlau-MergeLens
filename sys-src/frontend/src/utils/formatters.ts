import type { PredictionClass, PullRequestRecord } from '../types/pr';

export interface TextMetrics {
  titleLength: number;
  descriptionLength: number;
  wordCount: number;
  hasDescription: boolean;
}

export function computeTextMetrics(title: string, description: string): TextMetrics {
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const combined = `${trimmedTitle} ${trimmedDescription}`.trim();
  const wordCount = combined.length === 0 ? 0 : combined.split(/\s+/).length;

  return {
    titleLength: trimmedTitle.length,
    descriptionLength: trimmedDescription.length,
    wordCount,
    hasDescription: trimmedDescription.length > 0,
  };
}

export function formatProbability(probability: number): string {
  const clamped = Math.min(1, Math.max(0, probability));
  return `${(clamped * 100).toFixed(1)}%`;
}

export function formatPredictionLabel(predictedClass: PredictionClass): string {
  return predictedClass === 'merged' ? 'Likely Merged' : 'Likely Closed Without Merge';
}

export function formatShortDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

export function buildPullRequestKey(pr: Pick<PullRequestRecord, 'owner' | 'repo' | 'number'>): string {
  return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function formatLatency(latencyMs: number): string {
  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)} ms`;
  }
  return `${(latencyMs / 1000).toFixed(2)} s`;
}
