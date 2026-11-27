import type { InferenceResult } from '../types/pr';
import {
  formatLatency,
  formatPredictionLabel,
  formatProbability,
} from '../utils/formatters';
import { ProbabilityGauge } from './ProbabilityGauge';

interface PredictionPanelProps {
  result: InferenceResult | null;
  errorMessage: string | null;
  isEvaluating: boolean;
}

export function PredictionPanel({
  result,
  errorMessage,
  isEvaluating,
}: PredictionPanelProps) {
  return (
    <section className="card prediction-card" aria-label="Model prediction">
      <div className="card-header">
        <div>
          <h2 className="card-title">3. Model Triage Indication</h2>
          <p className="card-description">
            Binary merge-outcome estimate based strictly on PR title and description.
          </p>
        </div>
      </div>

      {isEvaluating && (
        <div className="evaluating-state" role="status">
          Running inference on PR title and description...
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <strong>Inference Error:</strong> {errorMessage}
        </div>
      )}

      {!isEvaluating && !errorMessage && !result && (
        <p className="empty-state-text">
          Select <strong>Evaluate PR</strong> to request a prediction and probability score.
        </p>
      )}

      {!isEvaluating && result && (
        <div className="prediction-body">
          <div className="prediction-hero">
            <div className="prediction-summary">
              <span className="section-label">Predicted Outcome</span>
              <div
                className={`prediction-outcome prediction-outcome--${result.predictedClass}`}
                data-testid="predicted-outcome"
              >
                {formatPredictionLabel(result.predictedClass)}
              </div>
              <div className="class-breakdown">
                <span className="breakdown-pill breakdown-pill--positive">
                  Merged: {formatProbability(result.mergeProbability)}
                </span>
                <span className="breakdown-pill breakdown-pill--negative">
                  Closed: {formatProbability(result.closedProbability)}
                </span>
              </div>
            </div>

            <ProbabilityGauge
              probability={result.mergeProbability}
              predictedClass={result.predictedClass}
            />
          </div>

          <dl className="metadata-grid">
            <div className="metadata-item">
              <dt>Inference Mode</dt>
              <dd>{result.mode === 'live' ? 'Live FastAPI Service' : 'Local Demo Placeholder'}</dd>
            </div>
            <div className="metadata-item">
              <dt>Model Version</dt>
              <dd>
                <code>{result.modelVersion}</code>
              </dd>
            </div>
            <div className="metadata-item">
              <dt>Inference Latency</dt>
              <dd>{formatLatency(result.latencyMs)}</dd>
            </div>
          </dl>

          <div className="disclaimer-box" role="note">
            <strong>Maintainer Triage Notice:</strong> This score reflects historical GH Archive
            merge patterns from text alone. It is <strong>not</strong> proof of technical quality,
            correctness, or closure reason, and does not automate review decisions.
          </div>
        </div>
      )}
    </section>
  );
}
