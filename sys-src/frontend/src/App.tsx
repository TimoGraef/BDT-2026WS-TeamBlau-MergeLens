import { useState } from 'react';
import { ComparePanel } from './components/ComparePanel';
import { EvaluationHistory } from './components/EvaluationHistory';
import { Header } from './components/Header';
import { MergeLens3DCanvas } from './components/MergeLens3DCanvas';
import { PredictionPanel } from './components/PredictionPanel';
import { PrLoaderForm } from './components/PrLoaderForm';
import { PrPreviewCard } from './components/PrPreviewCard';
import { SessionAnalyticsBar } from './components/SessionAnalyticsBar';
import { DEMO_SHOWCASE_PRS } from './data/demoPullRequests';
import {
  fetchOpenPullRequests,
  fetchPullRequest,
  parsePullRequestInput,
  parseRepositoryInput,
} from './services/githubApi';
import {
  checkInferenceHealth,
  DEFAULT_INFERENCE_API_URL,
  DEFAULT_INFERENCE_MODE,
  evaluatePullRequest,
  type InferenceHealthStatus,
} from './services/inferenceApi';
import type {
  EvaluationHistoryEntry,
  InferenceMode,
  InferenceResult,
  OpenPullRequestSummary,
  PullRequestRecord,
} from './types/pr';
import { buildPullRequestKey } from './utils/formatters';

export function App() {
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>(DEFAULT_INFERENCE_MODE);
  const [inferenceApiUrl, setInferenceApiUrl] = useState(DEFAULT_INFERENCE_API_URL);
  const [githubToken, setGithubToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const [healthStatus, setHealthStatus] = useState<InferenceHealthStatus | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const [activePr, setActivePr] = useState<PullRequestRecord | null>(null);
  const [prediction, setPrediction] = useState<InferenceResult | null>(null);
  const [history, setHistory] = useState<EvaluationHistoryEntry[]>([]);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);

  const [openPrs, setOpenPrs] = useState<OpenPullRequestSummary[]>([]);
  const [activeRepoLabel, setActiveRepoLabel] = useState<string | null>(null);

  const [isLoadingPr, setIsLoadingPr] = useState(false);
  const [isLoadingOpenPrs, setIsLoadingOpenPrs] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isRunningShowcase, setIsRunningShowcase] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  const upsertHistory = (pr: PullRequestRecord, result: InferenceResult) => {
    const entryKey = buildPullRequestKey(pr);
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.key !== entryKey);
      return [{ key: entryKey, pr, result }, ...filtered];
    });
  };

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const status = await checkInferenceHealth(inferenceApiUrl);
      setHealthStatus(status);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleRunShowcase = async () => {
    setLoadError(null);
    setInferenceError(null);
    setIsRunningShowcase(true);

    try {
      const evaluatedEntries: EvaluationHistoryEntry[] = [];
      for (const sample of DEMO_SHOWCASE_PRS) {
        const result = await evaluatePullRequest(
          { title: sample.title, description: sample.description },
          { mode: inferenceMode, apiBaseUrl: inferenceApiUrl },
        );
        const key = buildPullRequestKey(sample);
        evaluatedEntries.push({ key, pr: sample, result });
        setActivePr(sample);
        setPrediction(result);
        upsertHistory(sample, result);
      }

      // Highlight the highest-scoring PR and auto-compare best vs. lowest for demo impact
      const ranked = [...evaluatedEntries].sort(
        (a, b) => b.result.mergeProbability - a.result.mergeProbability,
      );
      if (ranked.length >= 2) {
        setActivePr(ranked[0].pr);
        setPrediction(ranked[0].result);
        setCompareKeys([ranked[0].key, ranked[ranked.length - 1].key]);
      }
    } catch (error) {
      setInferenceError(
        error instanceof Error ? error.message : 'Showcase evaluation failed.',
      );
    } finally {
      setIsRunningShowcase(false);
    }
  };

  const handleLoadPullRequest = async (input: string) => {
    setLoadError(null);
    setInferenceError(null);
    setIsLoadingPr(true);
    try {
      const reference = parsePullRequestInput(input);
      const record = await fetchPullRequest(reference, { token: githubToken || undefined });
      setActivePr(record);
      setPrediction(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load pull request.');
    } finally {
      setIsLoadingPr(false);
    }
  };

  const handleLoadOpenPullRequests = async (repoInput: string) => {
    setLoadError(null);
    setIsLoadingOpenPrs(true);
    try {
      const { owner, repo } = parseRepositoryInput(repoInput);
      const list = await fetchOpenPullRequests(owner, repo, {
        token: githubToken || undefined,
      });
      setActiveRepoLabel(`${owner}/${repo}`);
      setOpenPrs(list);
      if (list.length === 0) {
        setLoadError(`No open pull requests found in ${owner}/${repo}.`);
      }
    } catch (error) {
      setOpenPrs([]);
      setActiveRepoLabel(null);
      setLoadError(
        error instanceof Error ? error.message : 'Failed to list open pull requests.',
      );
    } finally {
      setIsLoadingOpenPrs(false);
    }
  };

  const handleSelectOpenPr = async (repoLabel: string, prNumber: number) => {
    await handleLoadPullRequest(`${repoLabel}#${prNumber}`);
  };

  const handleEvaluate = async () => {
    if (!activePr) {
      return;
    }
    setInferenceError(null);
    setIsEvaluating(true);
    try {
      const result = await evaluatePullRequest(
        { title: activePr.title, description: activePr.description },
        { mode: inferenceMode, apiBaseUrl: inferenceApiUrl },
      );
      setPrediction(result);
      upsertHistory(activePr, result);
    } catch (error) {
      setPrediction(null);
      setInferenceError(
        error instanceof Error ? error.message : 'Failed to evaluate pull request.',
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleBatchEvaluateOpenPrs = async () => {
    if (!activeRepoLabel || openPrs.length === 0) {
      return;
    }
    const { owner, repo } = parseRepositoryInput(activeRepoLabel);
    setLoadError(null);
    setInferenceError(null);

    try {
      for (let index = 0; index < openPrs.length; index += 1) {
        const item = openPrs[index];
        setBatchProgress(`Evaluating ${index + 1}/${openPrs.length}...`);

        const record = await fetchPullRequest(
          { owner, repo, number: item.number },
          { token: githubToken || undefined },
        );
        const result = await evaluatePullRequest(
          { title: record.title, description: record.description },
          { mode: inferenceMode, apiBaseUrl: inferenceApiUrl },
        );

        setActivePr(record);
        setPrediction(result);
        upsertHistory(record, result);
      }
    } catch (error) {
      setInferenceError(
        error instanceof Error ? error.message : 'Batch evaluation stopped due to an error.',
      );
    } finally {
      setBatchProgress(null);
    }
  };

  const handleSelectHistoryEntry = (entry: EvaluationHistoryEntry) => {
    setActivePr(entry.pr);
    setPrediction(entry.result);
    setLoadError(null);
    setInferenceError(null);
  };

  const handleToggleCompare = (key: string) => {
    setCompareKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((item) => item !== key);
      }
      if (prev.length >= 2) {
        return [prev[1], key];
      }
      return [...prev, key];
    });
  };

  const activeKey = activePr ? buildPullRequestKey(activePr) : null;
  const activeStep: 1 | 2 | 3 = prediction ? 3 : activePr ? 2 : 1;
  const compareEntries = compareKeys
    .map((key) => history.find((entry) => entry.key === key))
    .filter((entry): entry is EvaluationHistoryEntry => Boolean(entry));

  return (
    <div className="app-shell">
      <Header
        inferenceMode={inferenceMode}
        inferenceApiUrl={inferenceApiUrl}
        onModeChange={(mode) => {
          setInferenceMode(mode);
          setHealthStatus(null);
        }}
        onApiUrlChange={setInferenceApiUrl}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((prev) => !prev)}
        githubToken={githubToken}
        onGithubTokenChange={setGithubToken}
        healthStatus={healthStatus}
        isCheckingHealth={isCheckingHealth}
        onCheckHealth={handleCheckHealth}
        activeStep={activeStep}
        isRunningShowcase={isRunningShowcase}
        onRunShowcase={handleRunShowcase}
      />

      <SessionAnalyticsBar entries={history} />

      {compareEntries.length === 2 && (
        <ComparePanel
          left={compareEntries[0]}
          right={compareEntries[1]}
          onClearCompare={() => setCompareKeys([])}
        />
      )}

      <main className="workspace-grid">
        <div className="primary-column">
          <PrLoaderForm
            isLoadingPr={isLoadingPr}
            isLoadingOpenPrs={isLoadingOpenPrs}
            batchProgress={batchProgress}
            errorMessage={loadError}
            openPrs={openPrs}
            activeRepoLabel={activeRepoLabel}
            onLoadPullRequest={handleLoadPullRequest}
            onLoadOpenPullRequests={handleLoadOpenPullRequests}
            onSelectOpenPr={handleSelectOpenPr}
            onBatchEvaluateOpenPrs={handleBatchEvaluateOpenPrs}
          />

          <PrPreviewCard
            pr={activePr}
            isEvaluating={isEvaluating || Boolean(batchProgress) || isRunningShowcase}
            onEvaluate={handleEvaluate}
          />

          <PredictionPanel
            result={prediction}
            errorMessage={inferenceError}
            isEvaluating={isEvaluating}
          />
        </div>

        <div className="sidebar-column">
          <MergeLens3DCanvas prediction={prediction} history={history} />
          <EvaluationHistory
            entries={history}
            activeKey={activeKey}
            compareKeys={compareKeys}
            onSelectEntry={handleSelectHistoryEntry}
            onToggleCompare={handleToggleCompare}
            onClearHistory={() => {
              setHistory([]);
              setCompareKeys([]);
            }}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
