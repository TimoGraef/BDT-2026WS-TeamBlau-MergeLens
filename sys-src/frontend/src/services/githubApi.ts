import type {
  OpenPullRequestSummary,
  PullRequestRecord,
  PullRequestReference,
  PullRequestState,
} from '../types/pr';

const DEFAULT_GITHUB_API_URL =
  import.meta.env.VITE_GITHUB_API_URL?.replace(/\/+$/, '') || 'https://api.github.com';

const PR_URL_PATTERN =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?:\/.*)?$/;
const PR_SHORTHAND_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/;
const REPO_PATTERN = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

export class GitHubApiError extends Error {
  readonly status?: number;
  readonly isRateLimit: boolean;

  constructor(message: string, status?: number, isRateLimit = false) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.isRateLimit = isRateLimit;
  }
}

interface GitHubPullResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  user?: {
    login?: string;
    avatar_url?: string;
  } | null;
  labels?: Array<{ name?: string }>;
}

export function parsePullRequestInput(input: string): PullRequestReference {
  const cleaned = input.trim();
  const urlMatch = cleaned.match(PR_URL_PATTERN);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: Number.parseInt(urlMatch[3], 10),
    };
  }

  const shorthandMatch = cleaned.match(PR_SHORTHAND_PATTERN);
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      number: Number.parseInt(shorthandMatch[3], 10),
    };
  }

  throw new GitHubApiError(
    'Invalid pull request reference. Use a GitHub URL (https://github.com/owner/repo/pull/123) or shorthand (owner/repo#123).',
  );
}

export function parseRepositoryInput(input: string): { owner: string; repo: string } {
  const cleaned = input.trim();
  const match = cleaned.match(REPO_PATTERN);
  if (!match) {
    throw new GitHubApiError(
      'Invalid repository format. Use "owner/repo" or a GitHub repository URL.',
    );
  }
  return { owner: match[1], repo: match[2] };
}

function buildHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function handleGitHubError(response: Response, contextLabel: string): Promise<never> {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 403 && remaining === '0') {
    throw new GitHubApiError(
      'GitHub API rate limit reached (60 unauthenticated requests/hour). Provide a session GitHub token in settings or retry later.',
      403,
      true,
    );
  }
  if (response.status === 429) {
    throw new GitHubApiError(
      'GitHub API rate limit exceeded. Wait a moment or provide a session GitHub token.',
      429,
      true,
    );
  }
  if (response.status === 404) {
    throw new GitHubApiError(
      `${contextLabel} not found or private. Verify the owner, repository, and PR number.`,
      404,
    );
  }
  if (response.status === 401) {
    throw new GitHubApiError(
      'GitHub authentication failed. Check the provided session token.',
      401,
    );
  }

  throw new GitHubApiError(
    `GitHub API request failed (HTTP ${response.status}). Please retry.`,
    response.status,
  );
}

function mapPullState(raw: GitHubPullResponse): PullRequestState {
  if (raw.merged || raw.merged_at) {
    return 'merged';
  }
  return raw.state === 'open' ? 'open' : 'closed';
}

export async function fetchPullRequest(
  ref: PullRequestReference,
  options?: { token?: string; apiBaseUrl?: string; fetchImpl?: typeof fetch },
): Promise<PullRequestRecord> {
  const baseUrl = (options?.apiBaseUrl || DEFAULT_GITHUB_API_URL).replace(/\/+$/, '');
  const fetchFn = options?.fetchImpl || fetch;
  const endpoint = `${baseUrl}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;

  let response: Response;
  try {
    response = await fetchFn(endpoint, { headers: buildHeaders(options?.token) });
  } catch {
    throw new GitHubApiError(
      'Network error while contacting GitHub API. Check your connection and try again.',
    );
  }

  if (!response.ok) {
    await handleGitHubError(response, `Pull request ${ref.owner}/${ref.repo}#${ref.number}`);
  }

  const data = (await response.json()) as GitHubPullResponse;
  return {
    id: data.id,
    owner: ref.owner,
    repo: ref.repo,
    number: data.number,
    title: data.title ?? '',
    description: data.body ?? '',
    state: mapPullState(data),
    draft: Boolean(data.draft),
    authorLogin: data.user?.login ?? 'unknown',
    authorAvatarUrl: data.user?.avatar_url ?? null,
    htmlUrl: data.html_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mergedAt: data.merged_at ?? null,
    labels: (data.labels ?? [])
      .map((label) => label.name)
      .filter((name): name is string => Boolean(name)),
  };
}

export async function fetchOpenPullRequests(
  owner: string,
  repo: string,
  options?: { token?: string; perPage?: number; apiBaseUrl?: string; fetchImpl?: typeof fetch },
): Promise<OpenPullRequestSummary[]> {
  const baseUrl = (options?.apiBaseUrl || DEFAULT_GITHUB_API_URL).replace(/\/+$/, '');
  const fetchFn = options?.fetchImpl || fetch;
  const perPage = options?.perPage ?? 8;
  const endpoint = `${baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=${perPage}&sort=updated&direction=desc`;

  let response: Response;
  try {
    response = await fetchFn(endpoint, { headers: buildHeaders(options?.token) });
  } catch {
    throw new GitHubApiError(
      'Network error while listing open pull requests from GitHub API.',
    );
  }

  if (!response.ok) {
    await handleGitHubError(response, `Repository ${owner}/${repo}`);
  }

  const items = (await response.json()) as GitHubPullResponse[];
  return items.map((item) => ({
    id: item.id,
    number: item.number,
    title: item.title ?? '',
    authorLogin: item.user?.login ?? 'unknown',
    createdAt: item.created_at,
    draft: Boolean(item.draft),
    htmlUrl: item.html_url,
  }));
}
