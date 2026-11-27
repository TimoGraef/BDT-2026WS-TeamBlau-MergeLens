import { useId } from 'react';
import type { PredictionClass } from '../types/pr';
import { formatProbability } from '../utils/formatters';

interface ProbabilityGaugeProps {
  probability: number;
  predictedClass: PredictionClass;
}

const RADIUS = 76;
const SEMI_CIRCUMFERENCE = Math.PI * RADIUS;

export function ProbabilityGauge({ probability, predictedClass }: ProbabilityGaugeProps) {
  const gradientId = useId();
  const clamped = Math.min(1, Math.max(0, probability));
  const dashOffset = SEMI_CIRCUMFERENCE * (1 - clamped);
  const isPositive = predictedClass === 'merged';

  return (
    <div
      className={`gauge-wrapper gauge-wrapper--${predictedClass}`}
      aria-label={`Merge probability ${formatProbability(clamped)}`}
    >
      <svg viewBox="0 0 200 120" className="gauge-svg" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isPositive ? '#0ea5e9' : '#f97316'} />
            <stop offset="100%" stopColor={isPositive ? '#10b981' : '#f43f5e'} />
          </linearGradient>
        </defs>

        <path
          d="M 24 98 A 76 76 0 0 1 176 98"
          fill="none"
          stroke="rgba(148, 163, 184, 0.16)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 24 98 A 76 76 0 0 1 176 98"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={SEMI_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="gauge-arc"
        />

        <text x="20" y="114" className="gauge-tick">
          0%
        </text>
        <text x="100" y="14" textAnchor="middle" className="gauge-tick">
          50%
        </text>
        <text x="180" y="114" textAnchor="end" className="gauge-tick">
          100%
        </text>
      </svg>

      <div className="gauge-center">
        <span className="gauge-value" data-testid="probability-score">
          {formatProbability(clamped)}
        </span>
        <span className="gauge-caption">P(merged)</span>
      </div>
    </div>
  );
}
