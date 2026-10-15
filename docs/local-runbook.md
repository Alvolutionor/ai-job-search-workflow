# Local operator runbook

Run these commands from this repository root. JobTrending source and locked dependencies are included. Your profile, search configuration, browser session, and runtime data are created locally.

## 1. Prepare the existing application

If dependencies have not been installed:

```powershell
npm ci
npx playwright install chromium
```

Set `keywords`, `cityMode`, and the relevant city fields in `config/search.config.json` to match the user's search. The collector supports all-city, custom-city, and nationwide modes. The commands below use that general configuration.

Set optional matching criteria in `config/matching.config.json`, your profile in `config/candidate-profile.json`, and drafting preferences in `config/recruiting-policy.json`. Installation creates these from generic examples without overwriting existing files. The optional robotics research module reads your local `config/research.config.json`, initialized with a nationwide sample. Set `JOBTRENDING_RESEARCH_CONFIG` to use another file.

## 2. Log in and inspect a small search

```powershell
npm run login
```

Complete login/security verification manually and keep the browser open. Then collect the session and inspect the planned search:

```powershell
node ./src/cli/collect-cookies.mjs --cookies-only
node ./src/cli/crawl.mjs --config ./config/search.config.json --dry-run --city-limit 1 --keyword-limit 1
```

Collect one keyword-city list sample without retrieving every description:

```powershell
node ./src/cli/crawl.mjs --config ./config/search.config.json --city-limit 1 --keyword-limit 1 --skip-jd
```

After inspecting access and saved results, run the configured scope:

```powershell
node ./src/cli/crawl.mjs --config ./config/search.config.json
```

Omitting `--skip-jd` also requests descriptions. Existing task progress is reused. `--force` restarts matching tasks from page one; it is not required for ordinary continuation. `--skip-failed` leaves failed tasks for a separate retry run.

Use direct `node` invocations when passing options: the local README records option-forwarding problems with `npm run crawl -- ...` on this Windows setup. Stop for login/security problems rather than assuming an empty result proves no matching jobs exist.

## 3. Retrieve missing descriptions

```powershell
node ./src/cli/enrich.mjs --config ./config/search.config.json --limit 10 --dry-run
node ./src/cli/enrich.mjs --config ./config/search.config.json --limit 10
```

The detail queue selects jobs missing descriptions across configured keywords and cities. The current default avoids retrying failed detail attempts for six hours. This is an implementation detail of selection, not evidence that a listing is unavailable.

## 4. Optional domain-specific research scripts

The following existing scripts belong to a robotics research module. Use them when that module matches the user's chosen research; they are not required for other job searches. A different domain needs its own relevance definition and extraction rules.

Export pending roles:

```powershell
node ./scripts/export-pending-robotics-review.mjs
```

Read `data/research/robotics-review-pending.json`. Create a private verdict array with the exact pending job IDs and fields `id`, `relevant`, and `reason`. Keep incomplete descriptions out of reviewed skill counts.

Merge your reviewed file using its actual path:

```powershell
node ./scripts/merge-robotics-verdicts.mjs ./data/research/my-reviewed-verdicts.json
```

For a complete candidate-batch review, the existing validator takes a candidate array and verdict array:

```powershell
node ./scripts/validate-verdicts.mjs ./data/research/robotics-review-candidates.json ./data/research/robotics-review-draft.json
```

It checks duplicate IDs, missing/extra IDs, boolean decisions, and nonempty reasons. Validation does not judge whether the relevance decision is substantively correct. Do not replace the live verdict corpus with an incomplete draft.

The complete batch pipeline is:

```powershell
npm run research:boss
npm run research:candidates
npm run research:prepare
```

Fill every pending decision in `data/research/robotics-review-draft.json`, then:

```powershell
npm run research:validate
Copy-Item -LiteralPath data/research/robotics-review-draft.json -Destination data/research/robotics-review-verdicts.json
npm run research:export
npm run research:report
npm run research:audit
```

Zero matches for an individual skill are valid. Generated data and reports stay outside Git. To export a job-array JSON file as PDF:

```powershell
node ./scripts/make-pdf.mjs ./data/my-jobs.json ./data/research/my-jobs.pdf "My search results"
```

The title and input/output paths are supplied by the user. This export does not impose a domain or city order.

## 5. Open the local dashboard

```powershell
npm run web
```

| Route | Purpose |
| --- | --- |
| `http://127.0.0.1:3333/jobs` | Historical job table and filtering. |
| `http://127.0.0.1:3333/robotics` | Reviewed skill counts, source roles, and practice checks. |
| `http://127.0.0.1:3333/startups` | Company-grouped matching with fit reasons and gaps. |
| `http://127.0.0.1:3333/agent?job=JOB_ID` | Earlier draft-only page for manually supplied conversation text. Replace `JOB_ID` with an actual local ID. |
| `http://127.0.0.1:3333/workbench` | Current queue, conversation sync, drafts, confirmation, and handoff records. |

The root route opens the workbench. The service binds to the local machine.

## 6. Operate the recruiting workbench

1. Use **Open BOSS login**, complete verification, keep that browser open, then **Connect**.
2. Search the local pool or use live search with a keyword and any supported city or nationwide scope. Live search retrieves the first page. The collector uses the search configuration for broader collection.
3. Add a reviewed role to the queue. Selecting a local resume records intent only.
4. Review and confirm the contact action for that specific role.
5. Sync the inbox and read a selected conversation. Only loaded conversation data/history is available.
6. Generate/edit a reply, then review the exact recipient and text before confirming.
7. If using the newly implemented platform-attachment action, review the existing BOSS attachment selection separately. Its real-account behavior still needs verification.
8. Verify any `unconfirmed` attempt in BOSS before retrying anything.
9. Offer a contact exchange when appropriate; record actual WeChat completion manually.

Automatic drafting is enabled by default. Starting the monitor checks every 15 seconds and can draft for the selected conversation or unread conversations linked to queued jobs. It does not authorize automatic sending. Errors/security pages stop the monitor.

The standalone `/agent` page is draft-only; the workbench has separate live read/send paths. Set your communication goal in Settings. Place local resume PDFs in `data/resumes/`, or set `JOBTRENDING_RESUME_DIR` to your own directory.

## 7. Local model configuration and checks

The current draft runner uses the standard local Claude profile by default. `BOSS_AGENT_CLAUDE_PATH` selects the executable; `BOSS_AGENT_CLAUDE_CONFIG_DIR` can select a different profile. Account files are not edited by this workflow. Candidate facts live in the application's private `config/candidate-profile.json`.

The runner disables tools, external integrations, slash commands, and session persistence for the drafting call. Necessary profile/job/conversation context still goes to the configured model service.

```powershell
npm run test:recruiting
```

These are isolated fixtures for store behavior, confirmation, browser adapters, and UI interactions. They do not send messages to real recruiters and do not substitute for a verified logged-in integration. The integrated test suite passes locally; real recruiter actions are outside its fixture coverage.
