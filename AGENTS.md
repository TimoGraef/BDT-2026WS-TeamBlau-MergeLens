# MergeLens — Agent Instructions

Apply these instructions to the entire repository, regardless of the coding agent or model used. Keep changes focused on the requested task and preserve the project's scientific objective and modular architecture.

## 1. Instruction precedence and local preferences

- **MUST / MUST NOT:** Binding project requirements. Do not implement a conflicting change without explicitly identifying the conflict and obtaining confirmation that the requirement itself is to be revised.
- **SHOULD:** Project defaults and recommendations. Deviations are permitted as described below.
- **COULD:** Optional extensions, not implied implementation tasks.
- **PROVISIONAL:** Draft designs, candidate technologies, illustrative schemas and unresolved decisions. These are not binding specifications.

At the beginning of each task, read the applicable repository instructions and, if present, `.agents/AGENTS.local.md` relative to the repository root. Apply that file as an extension of these instructions, not as a replacement. If it is absent, use strict guidance. Do not create, modify, commit or disclose personal instructions without authorization.

- **Strict guidance (default):** Ask before implementing material deviations from documented recommendations or established design decisions. Explain the relevant risk and suggest an alternative.
- **Advisory guidance (local opt-in):** Follow explicit developer decisions that deviate from non-binding recommendations; briefly flag the deviation and its consequences without unnecessarily blocking the task.
- **Both modes:** Surface conflicts with binding requirements, the central experiment, architectural responsibilities or shared interfaces before making conflicting changes. Identify the specific rule or document, explain the impact and ask for a decision. Never silently choose between conflicting instructions or silently reinterpret a requirement. Local preferences cannot waive this rule.

Do not infer a developer's competence or permissions from their identity. Guidance levels are personal workflow preferences, not an authorization mechanism. Ordinary implementation details within the agreed scope do not require approval. A request to explore alternatives is not approval to implement them.

## 2. Project intent and MVP boundaries

MergeLens investigates whether a compact, fine-tuned pretrained language model can predict historical pull request merge outcomes from English PR titles and descriptions alone, providing an early triage indicator for maintainers.

**Binding requirements:**

- The initial classifier uses only PR title and description as predictive inputs, both during training and inference. Do not introduce source-code analysis, diffs, repository code context, contributor attributes or other predictive features into this baseline.
- Predict a binary historical outcome: merged = positive (`1`); closed without merging = negative (`0`). An unknown or nonterminal outcome is not a negative label. Review feedback such as `changes_requested` is not a terminal outcome.
- A merge outcome is a proxy learning signal, not ground truth for technical quality, usefulness or the reason for closure. Do not present predictions as proof of quality or as an automated acceptance decision.
- Maintain a lightweight, locally runnable solution. Maintainers explicitly request predictions and retain authority over PR review and acceptance. Autonomous PR acceptance/rejection, complete code-change inspection for the initial prediction and mandatory cloud hosting are outside MVP scope.

**Extensions and scope:** A clearly labeled model-derived score is desirable; its precise presentation remains open. GitHub authentication and browsing open PRs are optional. Lightweight contributor metadata may already be collected and stored and is a legitimate candidate for future model training and inference beyond the MVP. Its inclusion as a predictive feature is not currently planned, but remains consistent with the project concept and may be pursued depending on project progress, feasibility and experimental results. Preserve the text-only baseline and evaluate any such extension separately against it. Unlike lightweight descriptive and contributor features, source code and code diffs are outside the intended lightweight prediction approach. Do not expand the MVP merely because a field is available in a dataset or API.

## 3. Architecture and project context

Preserve the separation between offline data preparation/training and online maintainer-triggered inference. The README workflow and concept paper define the conceptual responsibilities, not immutable implementation details.

- **Acquisition and labeling:** Retrieve historical public GH Archive events, identify relevant PRs, associate events by PR identity, determine terminal outcomes and enrich records through the GitHub API where required. Persist extracted records in the database.
- **Preprocessing:** Retrieve stored records, clean and normalize text, filter unusable/non-English entries, standardize inputs and create disjoint training, validation and test datasets. Persist prepared datasets in the database. Do not train a model in this stage.
- **Training and evaluation:** Fine-tune a pretrained model for binary classification rather than train from scratch. Evaluate generalization on held-out data and persist the trained model and tokenizer for inference.
- **Online inference:** Retrieve PR information through the GitHub API or webhooks, display the title and description in the frontend, and invoke a separate inference API when the maintainer requests evaluation. The inference service loads the saved model/tokenizer; normal prediction requests must not trigger training. Display predictions and actionable errors clearly.

Keep responsibilities and interfaces explicit. Do not collapse the offline and online workflows, bypass database persistence as the integrated design, or introduce incompatible cross-module dependencies without discussing the architectural impact. Temporary files, fixtures and standalone module execution are acceptable for development, not substitutes for the agreed integrated architecture.

Consult `README.md`, the concept paper under `sys-doc/konzeptpapier/`, the relevant issue and existing implementation before making substantive changes. Use issue acceptance criteria for task scope; distinguish proposed implementation details from confirmed requirements. If documentation and implementation disagree, identify the discrepancy rather than treating either as automatically authoritative.

### Open technical decisions

Python and Polars are the current data-collection direction; the existing module also uses Requests. PySpark is an alternative if distributed processing is justified. PostgreSQL, PyTorch, Hugging Face Transformers, a compact BERT-based classifier, scikit-learn, FastAPI and React/TypeScript are proposed technologies or candidates, not universally fixed requirements. The model, database schema, observation period, preprocessing details, split ratios, compute environment, API contracts and exact service boundaries remain subject to implementation decisions and team agreement.

Respect technologies explicitly selected for the current task and established module dependencies. Do not introduce replacements or new dependencies without a concrete reason; discuss changes affecting shared interfaces, integration or reproducibility. Do not invent final schemas or endpoints from illustrative examples.

## 4. Data and model integrity

- Process historical data incrementally where practical; avoid loading the entire archive into memory. Respect GitHub API limits and avoid redundant requests. Handle missing fields, duplicates and recoverable failures explicitly.
- Preserve stable PR identity and determinable labels. Do not fabricate missing information. Follow issue-specific bot filtering, enrichment and observation-window requirements where applicable; these details do not define a universal final schema.
- Prevent leakage: keep all records of the same PR in one split; exclude outcome-derived information from predictive inputs. Prefer text available at submission time and document limitations when API-retrieved text or metadata may reflect later edits. Do not silently treat retrospective data as submission-time data.
- Keep the test set separate from training and model selection. Report per-class precision, recall, F1 and a confusion matrix; keep dataset splits, preprocessing, model settings and evaluation results traceable to a run/model version. Measure inference latency on target local hardware when evaluating the integrated system.
- Collect only relevant public data. Protect GitHub tokens and credentials; do not persist secrets or unnecessary personal information. Presence flags for public profile fields do not require retaining the corresponding raw values.

## 5. Repository structure and Docker integration

- Keep application source under `sys-src/`, backend components under `sys-src/backend/`, frontend code under `sys-src/frontend/`, and project documentation under `sys-doc/`. Preserve existing repository conventions and licensing files.
- **MUST:** Develop deliverable modules as Docker-containerized components and integrate the required services through `sys-src/docker-compose.yml`. Keep local execution reproducible across supported host platforms. Exact container boundaries, service names and deployment details remain open unless agreed.
- Use component-specific Dockerfiles, dependency declarations and suitable build contexts. Keep runtime configuration external to images; use environment variables for credentials and configurable settings. Exclude secrets, `.env` files, local caches and unnecessary artifacts from image build contexts and Git.
- Follow the existing data-collection Docker setup as an illustrative module pattern (local Dockerfile, dependency file and standalone development execution), not a mandatory directory or command template for every component. Host-specific scripts may be convenient but must not be the sole supported integration path.
- Use service names and configurable connection parameters rather than host-specific absolute paths or hard-coded container addresses. Coordinate ports, networks, persistent data and model artifacts through Compose as appropriate.
- Update affected Dockerfiles, dependency manifests and Compose configuration when changes require it. Verify the relevant container build and integration where feasible. Do not claim that placeholder services or empty configuration files already provide working integration.

## 6. Implementation and validation

- Prefer clear, maintainable, idiomatic code, cohesive modules and descriptive names. Follow existing conventions in the affected component; avoid unrelated refactoring, speculative abstractions and unnecessary dependencies.
- Comment sparingly. Add comments when intent, non-obvious behavior, assumptions or constraints cannot be understood directly from the code. Do not narrate self-explanatory statements or add redundant function comments. Document public interfaces where useful.
- Keep changes scoped to the issue or explicit request. Preserve unrelated developer changes. Ask before destructive operations, large unrelated migrations or changes that break shared interfaces.
- Add or update appropriate tests for changed behavior, including representative samples, edge cases and failure paths. Use existing test tooling when available; do not introduce a project-wide framework without justification.
- Run relevant checks and builds when possible. Report actual results, failures and checks not run; never claim verification that did not occur. Avoid launching expensive training, bulk downloads or large API jobs without agreement; use small representative samples for routine validation.

## 7. Git and GitHub workflow

Follow the branching and contribution guidelines in `README.md`.

- Use descriptive `feature/<feature-name>` and `bugfix/<fix-name>` branches for new features and fixes. Inspect the current branch and working tree before performing Git mutations. Do not silently switch branches or overwrite local work.
- Recommended commit formats: `feature(scope): <description>` and `bugfix(scope): <description>`. Suggested scopes include `database`, `frontend` and `backend`; use a meaningful scope and concise description. This format is recommended, not a mandatory commit gate.
- Avoid direct pushes to `main`. Integrate completed work through pull requests and seek review before merging whenever possible.
- **MUST:** Integrate branches using non-fast-forward merges (`git merge --no-ff`) to preserve merge commits and branch history required for GitInspector analysis. On GitHub, select **Create a merge commit**. Do not use fast-forward, squash or rebase merges for branch integration.
- Use `.github/ISSUE_TEMPLATE/feature.md` for feature/task issues and `.github/ISSUE_TEMPLATE/bug_report.md` for bugs. Include concrete objectives, open implementation questions and verifiable acceptance criteria where relevant. Follow an existing PR template if one is introduced; do not assume one currently exists.
- Do not stage, commit, push, create/switch branches, open/merge PRs or mutate remote issues unless requested or explicitly authorized. Never force-push, rewrite history, discard unrelated changes or expose credentials without appropriate explicit authorization; never commit secrets or personal agent preferences.

## 8. Documentation maintenance and task reporting

Keep the README, relevant architecture documentation, module instructions and this file consistent with approved changes. Update affected documentation as part of the same task when behavior, interfaces, deployment or architecture changes make it inaccurate. If an approved architectural change invalidates an instruction here, update the affected instruction and explicitly report the change. Do not silently weaken project rules, change the MVP, promote proposals to accepted decisions or revise the scientific objective to match an accidental implementation. Ask before altering binding requirements or the conflict-resolution policy.

At completion, briefly report relevant changes, validation results, unresolved issues and any deviations or documentation changes. Clearly distinguish implemented behavior from proposals and assumptions. Keep communication concise; do not produce extensive plans or explanations for straightforward tasks unless requested.
