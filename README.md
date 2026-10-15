# AI Job Search Workflow

A local job-search toolkit built around **JobTrending**: collect BOSS Zhipin listings, search a local job library, compare companies, manage an application queue, and draft recruiting messages with your own profile and goals.

The runnable application, tests, configuration examples, and workflow guides are included in this repository.

## Quick start

Requirements: Node.js 20.19+ or 22.12+ (the supported LTS lines) and npm. The login launcher discovers Chrome/Edge or uses the Chromium installed below; `JOBTRENDING_BROWSER_PATH` can select another installation. AI drafting additionally uses an authenticated local Claude CLI.

```powershell
git clone https://github.com/Alvolutionor/ai-job-search-workflow.git
cd ai-job-search-workflow
npm ci
npx playwright install chromium
npm run web
```

Visit `http://127.0.0.1:3333/workbench`. The empty-data workbench and job library can open before logging into BOSS or configuring a model.

Puppeteer reuses the detected browser; its duplicate browser download is disabled. Installation creates local configuration files from the examples without replacing existing files. Set up your search and profile before collecting listings or generating personal replies.

## Configure your search

| Local file | Purpose |
| --- | --- |
| `config/search.config.json` | Keywords, cities or nationwide search, collection settings. Replace `YOUR_JOB_KEYWORD`. |
| `config/matching.config.json` | Optional city/keyword exclusions, preferred contact titles, and priority terms. Empty lists retain all jobs; contacts are not prioritized by default. |
| `config/candidate-profile.json` | Your experience, skills, projects, targets, and preferences for drafting. |
| `config/recruiting-policy.json` | Your communication goal, output language, tone, and contact preference. |
| `config/research.config.json` | Optional robotics research scope. Starts nationwide; choose your own keywords and cities. `JOBTRENDING_RESEARCH_CONFIG` can select another scope file. |
| `data/resumes/` | Local PDF choices. Override with `JOBTRENDING_RESUME_DIR`. |

These local files and runtime data are ignored by Git. The committed `*.example.json` files contain no personal profile or recruiting history.

The user chooses roles, industries, cities, company sizes, contacts, and what to pursue. Matching uses the configured terms; the default company view does not filter for a particular career or city. Communication goals can also be set in the workbench Settings.

## Collect listings

```powershell
npm run login
```

Complete BOSS login and any security verification in the opened browser, then keep it open. After editing the search configuration:

```powershell
node ./src/cli/collect-cookies.mjs --cookies-only
node ./src/cli/crawl.mjs --config ./config/search.config.json --dry-run
node ./src/cli/crawl.mjs --config ./config/search.config.json
```

For a smaller collection, add `--city-limit 1 --keyword-limit 1`. Use `--skip-jd` for list-only collection and `node ./src/cli/enrich.mjs --config ./config/search.config.json --limit 10` to retrieve missing descriptions separately.

## Included tools

- **Job library** (`/jobs`): keyword, city, company, experience, and date filtering; CSV export; search provenance and collection progress.
- **Company view** (`/startups`): company-grouped results ordered using your matching configuration.
- **Recruiting workbench** (`/workbench`): queue, live search, loaded conversation snapshots, editable drafts, per-action sending confirmation, existing BOSS attachment selection, and contact-handoff records.
- **Standalone draft page** (`/agent?job=JOB_ID`): draft from a selected listing and manually supplied conversation.
- **Optional robotics research** (`/robotics`): the original domain-specific skill rules, source excerpts, review exports, and practice checks. Its sample scope is separate from the general search and matching settings.

Starting contact, sending a message, and sending an attachment are separate actions. Selecting a local PDF records a queue preference; the existing platform-attachment action sends an attachment already stored on BOSS.

## AI drafting

Fill in your local candidate profile and recruiting policy, or enter a communication goal in Settings. The runner uses the local Claude account; set `BOSS_AGENT_CLAUDE_PATH` if its executable needs an explicit path and `BOSS_AGENT_CLAUDE_CONFIG_DIR` to use another account profile.

Drafting sends the necessary profile/job/conversation context to the configured model service. It disables tools and external integrations for that call. The workbench presents the resulting draft for editing and confirmation.

## Tests

```powershell
npm test
```

Fourteen local tests cover configurable matching across unrelated careers and cities, user-directed prompts, mocked live search, empty-data pages/APIs, draft invalidation, duplicate submission, platform attachments, browser adapters, the workbench UI, first-run database fields, unbiased detail selection, and the research/report/PDF pipeline. Browser fixtures use intercepted pages and do not contact real recruiters.

Verified locally on Windows with Node.js 22.12.0. A GitHub Actions matrix checks Node.js 20/22 on Windows, Linux, and macOS. Fresh installation and empty-data startup are tested. Real logged-in BOSS selectors, message/attachment delivery, and an end-to-end model call from a new account remain unverified for this public version.

## Guides and templates

- [End-to-end workflow](docs/workflow.md)
- [Operator runbook](docs/local-runbook.md)
- [Evidence and matching](docs/evidence-and-matching.md)
- [Implementation and verification status](docs/status.md)
- [Repository audit and remaining limits](docs/repository-audit.md)
- [Data handling](docs/data-handling.md)
- [Candidate profile worksheet](templates/candidate-evidence.md)
- [Search and role review](templates/search-and-role-review.md)
- [Application and conversation record](templates/application-and-conversation.md)
- [Reusable drafting prompt](prompts/recruiting-draft.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Copy worksheets into a private workspace before filling them in. Browser sessions, job databases, resumes, conversations, and model credentials are not included in the public repository.
