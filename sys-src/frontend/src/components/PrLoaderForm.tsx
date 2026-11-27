import { useState, type FormEvent } from 'react';
import type { OpenPullRequestSummary } from '../types/pr';
import { formatShortDate } from '../utils/formatters';

interface PrLoaderFormProps {
  isLoadingPr: boolean;
  isLoadingOpenPrs: boolean;
  batchProgress: string | null;
  errorMessage: string | null;
  openPrs: OpenPullRequestSummary[];
  activeRepoLabel: string | null;
  onLoadPullRequest: (input: string) => Promise<void>;
  onLoadOpenPullRequests: (repoInput: string) => Promise<void>;
  onSelectOpenPr: (repoLabel: string, prNumber: number) => Promise<void>;
  onBatchEvaluateOpenPrs: () => Promise<void>;
}

const SAMPLE_PRS = [
  { label: 'facebook/react#31000', value: 'facebook/react#31000' },
  { label: 'fastapi/fastapi#12000', value: 'fastapi/fastapi#12000' },
  { label: 'pola-rs/polars#20000', value: 'pola-rs/polars#20000' },
];

export function PrLoaderForm({
  isLoadingPr,
  isLoadingOpenPrs,
  batchProgress,
  errorMessage,
  openPrs,
  activeRepoLabel,
  onLoadPullRequest,
  onLoadOpenPullRequests,
  onSelectOpenPr,
  onBatchEvaluateOpenPrs,
}: PrLoaderFormProps) {
  const [prInput, setPrInput] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const isBusy = isLoadingPr || Boolean(batchProgress);

  const handlePrSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prInput.trim()) {
      return;
    }
    await onLoadPullRequest(prInput);
  };

  const handleRepoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoInput.trim()) {
      return;
    }
    await onLoadOpenPullRequests(repoInput);
  };

  return (
    <section className="card loader-card" aria-label="Retrieve pull request">
      <div className="card-header">
        <div>
          <h2 className="card-title">1. Retrieve Pull Request via GitHub API</h2>
          <p className="card-description">
            Fetch a single public PR by URL or shorthand, or triage all open PRs in a repository.
          </p>
        </div>
      </div>

      <form className="loader-form" onSubmit={handlePrSubmit}>
        <label htmlFor="pr-reference-input" className="field-label">
          Pull Request URL or Shorthand
        </label>
        <div className="input-row">
          <input
            id="pr-reference-input"
            type="text"
            className="input-control"
            value={prInput}
            onChange={(event) => setPrInput(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123 or owner/repo#123"
            disabled={isBusy}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isBusy || prInput.trim().length === 0}
          >
            {isLoadingPr ? 'Loading PR...' : 'Load PR'}
          </button>
        </div>
      </form>

      <div className="quick-samples">
        <span className="samples-label">Quick examples:</span>
        {SAMPLE_PRS.map((sample) => (
          <button
            key={sample.value}
            type="button"
            className="chip-button"
            disabled={isBusy}
            onClick={() => {
              setPrInput(sample.value);
              void onLoadPullRequest(sample.value);
            }}
          >
            {sample.label}
          </button>
        ))}
      </div>

      <div className="divider" />

      <form className="loader-form" onSubmit={handleRepoSubmit}>
        <label htmlFor="repo-browse-input" className="field-label">
          Or Browse &amp; Batch-Triage Open PRs in a Repository
        </label>
        <div className="input-row">
          <input
            id="repo-browse-input"
            type="text"
            className="input-control"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="owner/repo (e.g. fastapi/fastapi)"
            disabled={isLoadingOpenPrs || Boolean(batchProgress)}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={isLoadingOpenPrs || Boolean(batchProgress) || repoInput.trim().length === 0}
          >
            {isLoadingOpenPrs ? 'Fetching...' : 'List Open PRs'}
          </button>
        </div>
      </form>

      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <strong>Retrieval Error:</strong> {errorMessage}
        </div>
      )}

      {openPrs.length > 0 && activeRepoLabel && (
        <div className="open-prs-box">
          <div className="open-prs-header">
            <span>
              Open PRs in {activeRepoLabel}{' '}
              <span className="muted-text">({openPrs.length} shown)</span>
            </span>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={isBusy}
              onClick={() => void onBatchEvaluateOpenPrs()}
            >
              {batchProgress ?? 'Evaluate All'}
            </button>
          </div>
          <ul className="open-prs-list">
            {openPrs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="open-pr-item"
                  disabled={isBusy}
                  onClick={() => {
                    const ref = `${activeRepoLabel}#${item.number}`;
                    setPrInput(ref);
                    void onSelectOpenPr(activeRepoLabel, item.number);
                  }}
                >
                  <span className="open-pr-number">#{item.number}</span>
                  <span className="open-pr-title">{item.title}</span>
                  <span className="open-pr-meta">
                    @{item.authorLogin} &middot; {formatShortDate(item.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
