import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('MergeLens App end-to-end flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a PR from GitHub API, evaluates it, and records it in the triage queue', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 901,
          number: 42,
          title: 'fix(api): prevent timeout on large payloads',
          body: 'Adds streaming parser and integration tests. Fixes #19.',
          state: 'open',
          draft: false,
          html_url: 'https://github.com/acme/mergelens/pull/42',
          created_at: '2026-11-22T12:00:00Z',
          updated_at: '2026-11-23T12:00:00Z',
          user: { login: 'contributor1' },
          labels: [{ name: 'bugfix' }],
        }),
        { status: 200 },
      ),
    );

    render(<App />);

    const input = screen.getByLabelText(/Pull Request URL or Shorthand/i);
    await user.type(input, 'acme/mergelens#42');
    await user.click(screen.getByRole('button', { name: /Load PR/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /fix\(api\): prevent timeout on large payloads/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Adds streaming parser and integration tests/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Evaluate PR/i }));

    await waitFor(() => {
      expect(screen.getByTestId('predicted-outcome')).toHaveTextContent('Likely Merged');
    });

    expect(screen.getByTestId('probability-score')).toHaveTextContent('%');
    expect(screen.getByText(/Maintainer Triage Notice/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acme\/mergelens#42/i })).toBeInTheDocument();
  });

  it('shows an actionable error when an invalid PR reference is submitted', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText(/Pull Request URL or Shorthand/i);
    await user.type(input, 'broken-input');
    await user.click(screen.getByRole('button', { name: /Load PR/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid pull request reference/i);
  });

  it('allows switching to Live Inference Mode in settings and surfaces backend errors', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 902,
            number: 7,
            title: 'docs: clarify setup',
            body: '',
            state: 'open',
            draft: false,
            html_url: 'https://github.com/acme/mergelens/pull/7',
            created_at: '2026-11-22T12:00:00Z',
            updated_at: '2026-11-23T12:00:00Z',
            user: { login: 'contributor2' },
            labels: [],
          }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Connection Settings/i }));
    await user.selectOptions(screen.getByLabelText(/Inference Mode/i), 'live');
    expect(screen.getByTestId('inference-mode-badge')).toHaveTextContent('Live Inference API');

    await user.type(screen.getByLabelText(/Pull Request URL or Shorthand/i), 'acme/mergelens#7');
    await user.click(screen.getByRole('button', { name: /Load PR/i }));

    await waitFor(() => {
      expect(screen.getByText(/Empty description:/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Evaluate PR/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the inference API/i);
  });

  it('lists open PRs, runs batch evaluation, renders KPI metrics, and toggles Model JSON view', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 10,
              number: 101,
              title: 'feat(core): add streaming batch support',
              body: 'Adds batch support and tests. Fixes #88.',
              state: 'open',
              draft: false,
              html_url: 'https://github.com/acme/mergelens/pull/101',
              created_at: '2026-11-24T10:00:00Z',
              updated_at: '2026-11-24T11:00:00Z',
              user: { login: 'dev1' },
              labels: [],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 10,
            number: 101,
            title: 'feat(core): add streaming batch support',
            body: 'Adds batch support and tests. Fixes #88.',
            state: 'open',
            draft: false,
            html_url: 'https://github.com/acme/mergelens/pull/101',
            created_at: '2026-11-24T10:00:00Z',
            updated_at: '2026-11-24T11:00:00Z',
            user: { login: 'dev1' },
            labels: [],
          }),
          { status: 200 },
        ),
      );

    render(<App />);

    await user.type(screen.getByLabelText(/Browse & Batch-Triage Open PRs/i), 'acme/mergelens');
    await user.click(screen.getByRole('button', { name: /List Open PRs/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Evaluate All/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Evaluate All/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Session triage metrics/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Model JSON/i }));
    expect(screen.getByText(/"title": "feat\(core\): add streaming batch support"/)).toBeInTheDocument();
  });

  it('runs the one-click Demo Showcase and opens the side-by-side comparison', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Run Demo Showcase/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Side-by-side PR comparison/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/5 orbiting PRs/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Close Compare/i }));
    expect(screen.queryByLabelText(/Side-by-side PR comparison/i)).not.toBeInTheDocument();
  });
});
