import type { EvaluationHistoryEntry } from '../types/pr';
import { formatLatency, formatProbability } from '../utils/formatters';

interface SessionAnalyticsBarProps {
  entries: EvaluationHistoryEntry[];
}

export function SessionAnalyticsBar({ entries }: SessionAnalyticsBarProps) {
  if (entries.length === 0) {
    return null;
  }

  const total = entries.length;
  const likelyMergedCount = entries.filter(
    (entry) => entry.result.predictedClass === 'merged',
  ).length;
  const avgScore =
    entries.reduce((sum, entry) => sum + entry.result.mergeProbability, 0) / total;
  const avgLatency =
    entries.reduce((sum, entry) => sum + entry.result.latencyMs, 0) / total;
  const mergedShare = Math.round((likelyMergedCount / total) * 100);

  return (
    <section className="kpi-strip" aria-label="Session triage metrics">
      <div className="kpi-card">
        <span className="kpi-label">Evaluated PRs</span>
        <strong className="kpi-value">{total}</strong>
        <span className="kpi-sub">Active session</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Likely Merged</span>
        <strong className="kpi-value kpi-value--positive">
          {likelyMergedCount} / {total}
        </strong>
        <span className="kpi-sub">{mergedShare}% positive signal</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Avg. Merge Score</span>
        <strong className="kpi-value">{formatProbability(avgScore)}</strong>
        <span className="kpi-sub">Mean P(merged)</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Avg. Latency</span>
        <strong className="kpi-value">{formatLatency(avgLatency)}</strong>
        <span className="kpi-sub">Client-measured</span>
      </div>
    </section>
  );
}
