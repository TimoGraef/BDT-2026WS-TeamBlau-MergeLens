import { describe, expect, it } from 'vitest';
import {
  buildPullRequestKey,
  computeTextMetrics,
  formatLatency,
  formatPredictionLabel,
  formatProbability,
  formatShortDate,
} from './formatters';

describe('formatters', () => {
  it('computes text metrics for populated and empty descriptions', () => {
    expect(computeTextMetrics('Fix bug', 'Adds unit test coverage')).toEqual({
      titleLength: 7,
      descriptionLength: 23,
      wordCount: 6,
      hasDescription: true,
    });

    expect(computeTextMetrics('  Only title  ', '   ')).toEqual({
      titleLength: 10,
      descriptionLength: 0,
      wordCount: 2,
      hasDescription: false,
    });

    expect(computeTextMetrics('', '')).toEqual({
      titleLength: 0,
      descriptionLength: 0,
      wordCount: 0,
      hasDescription: false,
    });
  });

  it('formats and clamps probability scores', () => {
    expect(formatProbability(0.8426)).toBe('84.3%');
    expect(formatProbability(-0.2)).toBe('0.0%');
    expect(formatProbability(1.5)).toBe('100.0%');
  });

  it('formats prediction labels', () => {
    expect(formatPredictionLabel('merged')).toBe('Likely Merged');
    expect(formatPredictionLabel('closed_without_merge')).toBe('Likely Closed Without Merge');
  });

  it('formats valid and invalid dates gracefully', () => {
    expect(formatShortDate('2026-11-20T12:00:00Z')).toContain('2026');
    expect(formatShortDate('not-a-date')).toBe('not-a-date');
  });

  it('builds stable pull request keys and formats latencies', () => {
    expect(buildPullRequestKey({ owner: 'octocat', repo: 'hello', number: 42 })).toBe(
      'octocat/hello#42',
    );
    expect(formatLatency(42.4)).toBe('42 ms');
    expect(formatLatency(1450)).toBe('1.45 s');
  });
});
