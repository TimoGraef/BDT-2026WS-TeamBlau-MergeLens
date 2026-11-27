import { useState } from 'react';
import type { EvaluationHistoryEntry, PredictionClass } from '../types/pr';
import { formatPredictionLabel, formatProbability } from '../utils/formatters';

interface EvaluationHistoryProps {
  entries: EvaluationHistoryEntry[];
  activeKey: string | null;
  compareKeys: string[];
  onSelectEntry: (entry: EvaluationHistoryEntry) => void;
  onToggleCompare: (key: string) => void;
  onClearHistory: () => void;
}

type HistoryFilter = 'all' | PredictionClass;

export function EvaluationHistory({
  entries,
  activeKey,
  compareKeys,
  onSelectEntry,
  onToggleCompare,
  onClearHistory,
}: EvaluationHistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const sorted = [...entries]
    .filter((entry) => filter === 'all' || entry.result.predictedClass === filter)
    .sort((a, b) => b.result.mergeProbability - a.result.mergeProbability);

  return (
    <aside className="card history-card" aria-label="Session triage queue">
      <div className="card-header">
        <div>
          <h2 className="card-title">Session Triage Queue</h2>
          <p className="card-description">
            Evaluated PRs ranked by merge probability score for quick prioritization.
          </p>
        </div>
        {entries.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={onClearHistory}>
            Clear
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="filter-row" role="group" aria-label="Filter triage queue">
          {(['all', 'merged', 'closed_without_merge'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`filter-chip ${filter === option ? 'filter-chip--active' : ''}`}
              onClick={() => setFilter(option)}
            >
              {option === 'all' ? 'All' : option === 'merged' ? 'Merged' : 'Closed'}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="empty-state-text">
          {entries.length === 0
            ? 'No PRs evaluated yet in this session. Evaluated PRs appear here ranked by score.'
            : 'No evaluated PRs match this filter.'}
        </p>
      ) : (
        <ul className="history-list">
          {sorted.map((entry, index) => {
            const isActive = entry.key === activeKey;
            const isCompared = compareKeys.includes(entry.key);
            return (
              <li key={entry.key} className="history-row">
                <button
                  type="button"
                  className={`history-item ${isActive ? 'history-item--active' : ''}`}
                  onClick={() => onSelectEntry(entry)}
                >
                  <div className="history-item-top">
                    <span className="history-rank-group">
                      <span className="rank-badge">#{index + 1}</span>
                      <span className="history-key">{entry.key}</span>
                    </span>
                    <span
                      className={`history-score history-score--${entry.result.predictedClass}`}
                    >
                      {formatProbability(entry.result.mergeProbability)}
                    </span>
                  </div>
                  <div className="history-title">{entry.pr.title}</div>
                  <div className="history-bar">
                    <div
                      className={`history-bar-fill history-bar-fill--${entry.result.predictedClass}`}
                      style={{ width: `${Math.round(entry.result.mergeProbability * 100)}%` }}
                    />
                  </div>
                  <div className="history-outcome">
                    {formatPredictionLabel(entry.result.predictedClass)}
                  </div>
                </button>
                <button
                  type="button"
                  className={`compare-toggle ${isCompared ? 'compare-toggle--active' : ''}`}
                  onClick={() => onToggleCompare(entry.key)}
                  aria-pressed={isCompared}
                  title="Pin for side-by-side comparison (select 2)"
                >
                  {isCompared ? 'Pinned' : 'Compare'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
