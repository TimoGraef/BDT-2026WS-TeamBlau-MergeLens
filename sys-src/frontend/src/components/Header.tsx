import type { InferenceHealthStatus } from '../services/inferenceApi';
import type { InferenceMode } from '../types/pr';
import { formatLatency } from '../utils/formatters';

interface HeaderProps {
  inferenceMode: InferenceMode;
  inferenceApiUrl: string;
  onModeChange: (mode: InferenceMode) => void;
  onApiUrlChange: (url: string) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  githubToken: string;
  onGithubTokenChange: (token: string) => void;
  healthStatus: InferenceHealthStatus | null;
  isCheckingHealth: boolean;
  onCheckHealth: () => Promise<void>;
  activeStep: 1 | 2 | 3;
  isRunningShowcase: boolean;
  onRunShowcase: () => Promise<void>;
}

const STEPS = [
  { step: 1, label: 'Retrieve PR' },
  { step: 2, label: 'Inspect Text' },
  { step: 3, label: 'Triage Score' },
] as const;

export function Header({
  inferenceMode,
  inferenceApiUrl,
  onModeChange,
  onApiUrlChange,
  showSettings,
  onToggleSettings,
  githubToken,
  onGithubTokenChange,
  healthStatus,
  isCheckingHealth,
  onCheckHealth,
  activeStep,
  isRunningShowcase,
  onRunShowcase,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M6 8.5v7a4 4 0 0 0 4 4h5.5" />
              <path d="M6 8.5a4 4 0 0 0 4 4h2.5" />
              <circle cx="17" cy="7" r="3" />
            </svg>
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">MergeLens</h1>
              <span className="version-tag">Team Blau</span>
            </div>
            <p className="brand-subtitle">
              Maintainer PR triage powered by title &amp; description signals
            </p>
          </div>
        </div>

        <nav className="stepper" aria-label="Triage workflow progress">
          {STEPS.map(({ step, label }) => {
            const state =
              step < activeStep ? 'done' : step === activeStep ? 'current' : 'upcoming';
            return (
              <div key={step} className={`step-pill step-pill--${state}`}>
                <span className="step-index">{step}</span>
                <span>{label}</span>
              </div>
            );
          })}
        </nav>

        <div className="header-controls">
          <button
            type="button"
            className="btn btn-primary btn-showcase"
            disabled={isRunningShowcase}
            onClick={() => void onRunShowcase()}
          >
            {isRunningShowcase ? 'Running Showcase...' : 'Run Demo Showcase'}
          </button>

          <span
            className={`mode-pill ${inferenceMode === 'live' ? 'mode-pill--live' : 'mode-pill--mock'}`}
            data-testid="inference-mode-badge"
          >
            <span className="status-dot" aria-hidden="true" />
            {inferenceMode === 'live' ? 'Live Inference API' : 'Demo Mode (Mock)'}
          </span>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onToggleSettings}
            aria-expanded={showSettings}
            aria-controls="connection-settings-panel"
          >
            {showSettings ? 'Hide Settings' : 'Connection Settings'}
          </button>
        </div>
      </div>

      {showSettings && (
        <section
          id="connection-settings-panel"
          className="settings-drawer"
          aria-label="Connection settings"
        >
          <div className="settings-grid">
            <div className="field-group">
              <label htmlFor="inference-mode-select" className="field-label">
                Inference Mode
              </label>
              <select
                id="inference-mode-select"
                className="input-control"
                value={inferenceMode}
                onChange={(event) => onModeChange(event.target.value as InferenceMode)}
              >
                <option value="mock">Demo Mode (Local Placeholder Evaluator)</option>
                <option value="live">Live Inference API (FastAPI Backend)</option>
              </select>
              <p className="field-hint">
                Switch to Live mode once the containerized inference service is running.
              </p>
            </div>

            <div className="field-group">
              <label htmlFor="inference-api-url" className="field-label">
                Inference API Base URL
              </label>
              <div className="input-row">
                <input
                  id="inference-api-url"
                  type="url"
                  className="input-control"
                  value={inferenceApiUrl}
                  onChange={(event) => onApiUrlChange(event.target.value)}
                  placeholder="http://localhost:8000"
                  disabled={inferenceMode === 'mock'}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={inferenceMode === 'mock' || isCheckingHealth}
                  onClick={() => void onCheckHealth()}
                >
                  {isCheckingHealth ? 'Checking...' : 'Test API'}
                </button>
              </div>
              {healthStatus && inferenceMode === 'live' ? (
                <p
                  className={`field-hint ${healthStatus.ok ? 'hint-positive' : 'hint-negative'}`}
                  role="status"
                >
                  {healthStatus.message} ({formatLatency(healthStatus.latencyMs)})
                </p>
              ) : (
                <p className="field-hint">
                  Calls <code>POST /predict</code> with <code>{'{ title, description }'}</code> and{' '}
                  <code>GET /health</code>.
                </p>
              )}
            </div>

            <div className="field-group">
              <label htmlFor="github-session-token" className="field-label">
                GitHub Session Token (optional)
              </label>
              <input
                id="github-session-token"
                type="password"
                className="input-control"
                value={githubToken}
                onChange={(event) => onGithubTokenChange(event.target.value)}
                placeholder="ghp_... (kept in memory only)"
                autoComplete="off"
              />
              <p className="field-hint">
                Never persisted to storage. Only needed if GitHub&apos;s 60 req/h unauthenticated
                limit is reached.
              </p>
            </div>
          </div>
        </section>
      )}
    </header>
  );
}
