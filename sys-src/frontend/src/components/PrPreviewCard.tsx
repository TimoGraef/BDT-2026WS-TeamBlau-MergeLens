import { useState } from 'react';
import type { PullRequestRecord } from '../types/pr';
import {
  buildPullRequestKey,
  computeTextMetrics,
  formatShortDate,
} from '../utils/formatters';

interface PrPreviewCardProps {
  pr: PullRequestRecord | null;
  isEvaluating: boolean;
  onEvaluate: () => Promise<void>;
}

export function PrPreviewCard({ pr, isEvaluating, onEvaluate }: PrPreviewCardProps) {
  const [viewMode, setViewMode] = useState<'description' | 'payload'>('description');

  if (!pr) {
    return (
      <section className="card empty-card" aria-label="Pull request preview">
        <h2 className="card-title">2. Pull Request Inspection</h2>
        <p className="empty-state-text">
          Load a pull request above to inspect its title and description before requesting an
          evaluation.
        </p>
      </section>
    );
  }

  const metrics = computeTextMetrics(pr.title, pr.description);
  const prKey = buildPullRequestKey(pr);
  const exactModelPayload = JSON.stringify(
    { title: pr.title.trim(), description: pr.description.trim() },
    null,
    2,
  );

  return (
    <section className="card pr-preview-card" aria-label="Pull request preview">
      <div className="card-header">
        <div>
          <div className="pr-eyebrow">
            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="pr-link"
            >
              {prKey}
            </a>
            <span className={`state-badge state-badge--${pr.state}`}>
              {pr.draft ? 'Draft' : pr.state}
            </span>
          </div>
          <h2 className="pr-title">{pr.title}</h2>
          <div className="pr-meta-row">
            {pr.authorAvatarUrl ? (
              <img
                src={pr.authorAvatarUrl}
                alt=""
                className="author-avatar"
                width="20"
                height="20"
              />
            ) : (
              <span className="author-avatar-fallback" aria-hidden="true">
                {pr.authorLogin.slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="pr-meta">
              Opened by <strong>@{pr.authorLogin}</strong> on {formatShortDate(pr.createdAt)}{' '}
              &middot; {metrics.wordCount} words sent to classifier
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-evaluate"
          onClick={() => void onEvaluate()}
          disabled={isEvaluating}
        >
          {isEvaluating ? 'Evaluating...' : 'Evaluate PR'}
        </button>
      </div>

      {pr.labels.length > 0 && (
        <div className="label-list" aria-label="Pull request labels">
          {pr.labels.map((label) => (
            <span key={label} className="pr-label">
              {label}
            </span>
          ))}
        </div>
      )}

      {pr.state !== 'open' && (
        <div className="alert alert-info" role="note">
          <strong>Historical PR note:</strong> This PR is already <code>{pr.state}</code>. GitHub
          API text may include edits made after initial submission; MergeLens sends only the title
          and description.
        </div>
      )}

      {!metrics.hasDescription && (
        <div className="alert alert-warning" role="note">
          <strong>Empty description:</strong> This PR has no description body. The model will
          evaluate the title alone.
        </div>
      )}

      <div className="scope-banner">
        <strong>Model input scope (text-only baseline):</strong> Only the PR <em>title</em> and{' '}
        <em>description</em> are sent to <code>POST /predict</code>. Code diffs, repository files,
        and contributor attributes are excluded.
      </div>

      <div className="description-box">
        <div className="description-toolbar">
          <h3 className="section-label">
            {viewMode === 'description' ? 'Pull Request Description' : 'Exact POST /predict Payload'}
          </h3>
          <div className="segmented-control" role="tablist" aria-label="Inspection view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'description'}
              className={`segment-btn ${viewMode === 'description' ? 'segment-btn--active' : ''}`}
              onClick={() => setViewMode('description')}
            >
              Description
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'payload'}
              className={`segment-btn ${viewMode === 'payload' ? 'segment-btn--active' : ''}`}
              onClick={() => setViewMode('payload')}
            >
              Model JSON
            </button>
          </div>
        </div>

        {viewMode === 'payload' ? (
          <pre className="description-text payload-json">{exactModelPayload}</pre>
        ) : metrics.hasDescription ? (
          <pre className="description-text">{pr.description}</pre>
        ) : (
          <p className="muted-text">No description provided.</p>
        )}
      </div>
    </section>
  );
}
