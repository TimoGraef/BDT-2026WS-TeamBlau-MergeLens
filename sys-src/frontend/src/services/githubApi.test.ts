import { describe, expect, it, vi } from 'vitest';
import {
  fetchOpenPullRequests,
  fetchPullRequest,
  GitHubApiError,
  parsePullRequestInput,
  parseRepositoryInput,
} from './githubApi';

describe('githubApi parsing', () => {
  it('parses full GitHub PR URLs and shorthand references', () => {
    expect(parsePullRequestInput('https://github.com/fastapi/fastapi/pull/1234')).toEqual({
      owner: 'fastapi',
      repo: 'fastapi',
      number: 1234,
    });

    expect(parsePullRequestInput('https://github.com/facebook/react/pull/42/files')).toEqual({
      owner: 'facebook',
      repo: 'react',
      number: 42,
    });

    expect(parsePullRequestInput('pola-rs/polars#99')).toEqual({
      owner: 'pola-rs',
      repo: 'polars',
      number: 99,
    });
  });

  it('rejects malformed PR references', () => {
    expect(() => parsePullRequestInput('not-a-pr')).toThrow(GitHubApiError);
    expect(() => parsePullRequestInput('https://github.com/owner/repo/issues/10')).toThrow(
      GitHubApiError,
    );
  });

  it('parses repository inputs and rejects invalid ones', () => {
    expect(parseRepositoryInput('fastapi/fastapi')).toEqual({
      owner: 'fastapi',
      repo: 'fastapi',
    });
    expect(parseRepositoryInput('https://github.com/pola-rs/polars.git')).toEqual({
      owner: 'pola-rs',
      repo: 'polars',
    });
    expect(() => parseRepositoryInput('invalid')).toThrow(GitHubApiError);
  });
});

describe('githubApi network requests', () => {
  it('fetches and normalizes a pull request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 501,
          number: 12,
          title: 'feat(ui): add triage view',
          body: 'Implements PR inspection. Fixes #5.',
          state: 'closed',
          merged: true,
          merged_at: '2026-11-10T10:00:00Z',
          draft: false,
          html_url: 'https://github.com/team/repo/pull/12',
          created_at: '2026-11-08T10:00:00Z',
          updated_at: '2026-11-10T10:00:00Z',
          user: { login: 'alice', avatar_url: 'https://example.com/a.png' },
          labels: [{ name: 'feature' }, { name: 'frontend' }],
        }),
        { status: 200 },
      ),
    );

    const record = await fetchPullRequest(
      { owner: 'team', repo: 'repo', number: 12 },
      { token: 'ghp_test', fetchImpl: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/team/repo/pulls/12',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test',
        }),
      }),
    );
    expect(record.state).toBe('merged');
    expect(record.authorLogin).toBe('alice');
    expect(record.labels).toEqual(['feature', 'frontend']);
  });

  it('surfaces actionable errors for 404, 403 rate limit, 401, and network failures', async () => {
    const notFoundFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      fetchPullRequest({ owner: 'a', repo: 'b', number: 1 }, { fetchImpl: notFoundFetch }),
    ).rejects.toThrow(/not found/i);

    const rateLimitFetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    );
    await expect(
      fetchPullRequest({ owner: 'a', repo: 'b', number: 1 }, { fetchImpl: rateLimitFetch }),
    ).rejects.toThrow(/rate limit/i);

    const authFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      fetchPullRequest({ owner: 'a', repo: 'b', number: 1 }, { fetchImpl: authFetch }),
    ).rejects.toThrow(/authentication failed/i);

    const networkFetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(
      fetchPullRequest({ owner: 'a', repo: 'b', number: 1 }, { fetchImpl: networkFetch }),
    ).rejects.toThrow(/Network error/i);
  });

  it('lists open pull requests for a repository', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            number: 77,
            title: 'fix: prevent crash on empty body',
            body: 'details',
            state: 'open',
            draft: false,
            html_url: 'https://github.com/team/repo/pull/77',
            created_at: '2026-11-20T09:00:00Z',
            updated_at: '2026-11-21T09:00:00Z',
            user: { login: 'bob' },
          },
        ]),
        { status: 200 },
      ),
    );

    const list = await fetchOpenPullRequests('team', 'repo', { fetchImpl: fetchMock });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      number: 77,
      title: 'fix: prevent crash on empty body',
      authorLogin: 'bob',
    });
  });
});
