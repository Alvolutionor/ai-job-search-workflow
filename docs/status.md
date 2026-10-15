# Implementation and verification status

Source review date: **2026-10-15**. This repository documents a local setup; it does not package that setup or claim a successful hiring outcome.

## What was inspected

| Local component | Inspected evidence | What this supports |
| --- | --- | --- |
| Collector and storage | `src/cli/crawl.mjs`, `src/cli/enrich.mjs`, `src/lib/db.mjs`, search configs, application README/package scripts | Configurable search, local job/provenance storage, task progress, and description enrichment. |
| Relevance review | `config/robotics-review-policy.mjs`, `scripts/validate-verdicts.mjs`, research workflow documentation | Minimum description threshold and exact-ID verdict validation. |
| Company matching | `src/lib/startup-matches.mjs` | The documented filters, ordering, scores, and evidence gaps. |
| Recruiting state and actions | `src/lib/recruiting-store.mjs`, `src/server/recruiting-router.mjs` | Queue, snapshots, context versions, draft states, per-action confirmation, and platform-attachment routes. |
| AI drafts | `src/lib/recruiting-agent.mjs` | Profile-grounded prompting, configured CLI invocation, tools disabled, and draft-only model output. |
| Regression coverage inventory | Test declarations in `tests/recruiting.test.mjs` | Tests exist for invalidation, duplicate submission, contact attribution, HTTP approval, browser adapters, and UI flow. They were not rerun for this summary. |
| Candidate/material workflow | Candidate-confirmed profile and evidence index; resume-directory inventory and its research summary | Reusable profile information and multiple application-material variants. Personal content is excluded from this repository. |

All application paths in this table are relative to the separately existing local `jobtrending` root. They are source references, not files included in this repository. Private machine paths and source excerpts are intentionally omitted.

## Current boundaries

- The source includes personalized matching and live-search restrictions, fixed score weights, domain-specific review scripts, and a specialized drafting prompt. These are limits of that local implementation, not career guidance or defaults for the reusable workflow. Source changes are required where those choices are hard-coded. This repository's generic prompt and templates let the user supply their own goals.

- The local application is evolving. The newest router includes sending an attachment already stored on BOSS; older README text still describes attachment sending as unimplemented. Treat the new path as implemented in source but pending real-account verification.
- A selected local PDF is only a queue preference. It is not automatically uploaded by that action.
- The earlier standalone agent page accepts manually supplied conversation text. The current workbench has separate live browser paths. These are different operating modes.
- Live search in the workbench retrieves one current search page, not a complete crawl.
- Conversation reads cover loaded data/history, not the entire account archive.
- The monitor can generate drafts; it does not send autonomously.
- WeChat handoff is a local record. QR recognition and WeChat application control are not implemented.
- Existing candidate/resume configuration includes machine-specific assumptions, including a fixed resume directory. The local app has not been established as portable by this documentation release.
- Interviews, offers, acceptance, and measured hiring success are not established by the inspected implementation.

## Verification scope for this publication

The publication checks repository contents, internal Markdown file links, documented command/script names, and potentially sensitive strings. It verifies the GitHub repository is public and that the pushed revision matches the local revision.

This review did **not** rerun the application's tests, collect fresh listings, log into BOSS, verify real selectors, send any recruiter message or attachment, operate WeChat, or audit every local project. Source inspection is evidence of implementation shape, not proof of end-to-end live success.

## Related upstream projects

The existing local application's README identifies these upstream sources. This summary links to them for attribution and does not redistribute their code or claim their features as original work:

- [geekgeekrun](https://github.com/geekgeekrun/geekgeekrun): referenced for city data and browser/search integration patterns.
- [auto-zhipin](https://github.com/ufownl/auto-zhipin): referenced for login flow and salary numeral handling.
- [BossHunter](https://github.com/powerycy/BossHunter): referenced by the local workbench for browser-adapter behavior.
- [boss-helper](https://github.com/Ocyss/boss-helper): a separate third-party browser extension present locally; its presence does not establish it is running in the current workflow.

These attributions come from local files. Remote maintenance status, current feature support, and licenses were not audited for this summary. The separate historical LinkedIn auto-applier directory was only identified; its implementation and current use were not reviewed.
