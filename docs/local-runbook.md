# Local operator runbook

These commands belong to the existing **local `jobtrending` application**, not this documentation repository. Run them from that application's root. Its private source, dependencies, browser profile, and candidate configuration are not bundled here.

## 1. Prepare the existing application

If dependencies have not been installed:

```powershell
npm install
npx playwright install chromium
```

Use the application's own search configuration. The focused file inspected for this summary is `config/robotics-ai-startups.config.json`; it targets Shanghai/Shenzhen and searches robotics, AI applications, full-stack work, agents, smart hardware, and voice interaction.

## 2. Log in and inspect a small search

```powershell
npm run login
```

Complete login/security verification manually and keep the browser open. Then collect the session and inspect the planned search:

```powershell
node ./src/cli/collect-cookies.mjs --cookies-only
node ./src/cli/crawl.mjs --config ./config/robotics-ai-startups.config.json --dry-run --city-limit 1 --keyword-limit 1
```

Collect one keyword-city list sample without retrieving every description:

```powershell
node ./src/cli/crawl.mjs --config ./config/robotics-ai-startups.config.json --city-limit 1 --keyword-limit 1 --skip-jd
```

After inspecting access and saved results, run the configured scope:

```powershell
node ./src/cli/crawl.mjs --config ./config/robotics-ai-startups.config.json
```

Omitting `--skip-jd` also requests descriptions. Existing task progress is reused. `--force` restarts matching tasks from page one; it is not required for ordinary continuation. `--skip-failed` leaves failed tasks for a separate retry run.

Use direct `node` invocations when passing options: the local README records option-forwarding problems with `npm run crawl -- ...` on this Windows setup. Stop for login/security problems rather than assuming an empty result proves no matching jobs exist.

## 3. Retrieve missing descriptions

```powershell
node ./src/cli/enrich.mjs --config ./config/robotics-ai-startups.config.json --limit 10 --dry-run
node ./src/cli/enrich.mjs --config ./config/robotics-ai-startups.config.json --limit 10
```

The detail queue selects jobs missing descriptions across configured keywords and cities. The current default avoids retrying failed detail attempts for six hours. This is an implementation detail of selection, not evidence that a listing is unavailable.

## 4. Review new robotics evidence

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

The application also provides `npm run research:boss`, `npm run research:report`, and `npm run research:audit` for its research export/report/audit pipeline. Inspect those scripts' expected input artifacts before rebuilding a historical report; they are distinct from the incremental pending-review workflow.

## 5. Open the local dashboard

```powershell
npm run web
```

| Route | Purpose |
| --- | --- |
| `http://localhost:3333/jobs` | Historical job table and filtering. |
| `http://localhost:3333/robotics` | Reviewed skill counts, source roles, and practice checks. |
| `http://localhost:3333/startups` | Company-grouped matching with fit reasons and gaps. |
| `http://localhost:3333/agent?job=JOB_ID` | Earlier draft-only page for manually supplied conversation text. Replace `JOB_ID` with an actual local ID. |
| `http://localhost:3333/workbench` | Current queue, conversation sync, drafts, confirmation, and handoff records. |

The root route opens the robotics dashboard. The service binds to the local machine.

## 6. Operate the recruiting workbench

1. Use **Open BOSS login**, complete verification, keep that browser open, then **Connect**.
2. Search the historical pool or request a current Shanghai/Shenzhen search page. The live-search endpoint retrieves the first page only.
3. Add a reviewed role to the queue. Selecting a local resume records intent only.
4. Review and confirm the contact action for that specific role.
5. Sync the inbox and read a selected conversation. Only loaded conversation data/history is available.
6. Generate/edit a reply, then review the exact recipient and text before confirming.
7. If using the newly implemented platform-attachment action, review the existing BOSS attachment selection separately. Its real-account behavior still needs verification.
8. Verify any `unconfirmed` attempt in BOSS before retrying anything.
9. Offer a contact exchange when appropriate; record actual WeChat completion manually.

Automatic drafting is enabled by default. Starting the monitor checks every 15 seconds and can draft for the selected conversation or unread conversations linked to queued jobs. It does not authorize automatic sending. Errors/security pages stop the monitor.

The earlier `/agent` page is draft-only; the newer workbench has separate live read/send paths. Older README sections describing all sending as unimplemented do not describe the latest workbench source.

## 7. Local model configuration and checks

The current draft runner uses the standard local Claude profile by default. `BOSS_AGENT_CLAUDE_PATH` selects the executable; `BOSS_AGENT_CLAUDE_CONFIG_DIR` can select a different profile. Account files are not edited by this workflow. Candidate facts live in the application's private `config/candidate-profile.json`.

The runner disables tools, external integrations, slash commands, and session persistence for the drafting call. Necessary profile/job/conversation context still goes to the configured model service.

```powershell
npm run test:recruiting
```

These are isolated fixtures for store behavior, confirmation, browser adapters, and UI interactions. They do not send messages to real recruiters and do not substitute for a verified logged-in integration. No existing application's tests or live actions were run as part of publishing this summary.
