export type PullRequestState = 'open' | 'closed' | 'merged';

export interface PullRequestReference {
  owner: string;
  repo: string;
  number: number;
}

export interface PullRequestRecord {
  id: number;
  owner: string;
  repo: string;
  number: number;
  title: string;
  description: string;
  state: PullRequestState;
  draft: boolean;
  authorLogin: string;
  authorAvatarUrl: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  labels: string[];
}

export interface OpenPullRequestSummary {
  id: number;
  number: number;
  title: string;
  authorLogin: string;
  createdAt: string;
  draft: boolean;
  htmlUrl: string;
}

export type PredictionClass = 'merged' | 'closed_without_merge';

export type InferenceMode = 'live' | 'mock';

export interface InferenceRequest {
  title: string;
  description: string;
}

export interface InferenceResult {
  predictedClass: PredictionClass;
  mergeProbability: number;
  closedProbability: number;
  modelVersion: string;
  latencyMs: number;
  mode: InferenceMode;
  evaluatedAt: string;
}

export interface EvaluationHistoryEntry {
  key: string;
  pr: PullRequestRecord;
  result: InferenceResult;
}
