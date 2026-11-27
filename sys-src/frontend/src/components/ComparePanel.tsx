import type { EvaluationHistoryEntry } from '../types/pr';
import {
  computeTextMetrics,
  formatPredictionLabel,
  formatProbability,
} from '../utils/formatters';

interface ComparePanelProps {
  left: EvaluationHistoryEntry;
  right: EvaluationHistoryEntry;
  onClearCompare: () => void;
}

export function ComparePanel({ left, right, onClearCompare }: ComparePanelProps) {
  const delta = left.result.mergeProbability - right.result.mergeProbability;
  const deltaPoints = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`;
  const leftMetrics = computeTextMetrics(left.pr.title, left.pr.description);
  const rightMetrics = computeTextMetrics(right.pr.title, right.pr.description);

  return (
    <section className="card compare-card" aria-label="Side-by-side PR comparison">
      <div className="card-header">
        <div>
          <h2 className="card-title">Side-by-Side Triage Comparison</h2>
          <p className="card-description">
            Comparing text-only merge signals &middot; Score delta:{' '}
            <strong className="delta-highlight">{deltaPoints}</strong>
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClearCompare}>
          Close Compare
        </button>
      </div>

      <div className="compare-grid">
        {[
          { entry: left, metrics: leftMetrics, tag: 'PR A' },
          { entry: right, metrics: rightMetrics, tag: 'PR B' },
        ].map(({ entry, metrics, tag }) => (
          <div key={entry.key} className="compare-slot">
            <div className="compare-slot-top">
              <span className="rank-badge">{tag}</span>
              <span className="history-key">{entry.key}</span>
              <span
                className={`history-score history-score--${entry.result.predictedClass}`}
              >
                {formatProbability(entry.result.mergeProbability)}
              </span>
            </div>
            <h3 className="compare-title">{entry.pr.title}</h3>
            <div className="compare-stats">
              <span>{formatPredictionLabel(entry.result.predictedClass)}</span>
              <span>{metrics.wordCount} words</span>
              <span>{metrics.hasDescription ? 'Has description' : 'Empty description'}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
