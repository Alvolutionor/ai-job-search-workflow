# AI Job Search Workflow

A reusable, local-first job-search workflow: collect listings, organize opportunities, prepare application materials, and assist with recruiting conversations.

This repository summarizes an existing Windows setup centered on BOSS Zhipin, a local `jobtrending` project, evidence-backed resumes, and AI-assisted message drafts. It contains the playbook, reusable templates, and an operator runbook. The collector and recruiting application are **not distributed here**; cloning this repository does not install them.

Reviewed on **2026-10-15**. The local recruiting application was being developed during the review, so implementation and live verification are reported separately.

## The workflow

| Step | What happens | Output and decision |
| --- | --- | --- |
| 1. Establish candidate facts | Supply the experience, skills, resumes, and materials the user wants to work with. | A private source of truth, with uncertain claims kept separate. |
| 2. Define the search | Let the user choose roles, industries, keywords, locations, and optional filters. | An explicit search scope rather than an open-ended feed. |
| 3. Collect opportunities | Search BOSS through the candidate's logged-in browser and keep observations locally. | Deduplicated jobs, search provenance, and resumable collection tasks. |
| 4. Read and review descriptions | Retrieve missing job descriptions and judge actual relevance by job ID. | A reviewed corpus; incomplete listings remain candidates. |
| 5. Understand demand | Count explicit skill evidence and attach a practice check to each skill. | A learning backlog grounded in the reviewed sample. |
| 6. Shortlist companies | Group roles by company and compare them using the user's selection criteria. | An application queue chosen by the user. |
| 7. Tailor materials | Create or select resume variants for whichever roles the user targets. | A selected PDF and matching BOSS profile text. |
| 8. Start contact | Review a specific role before initiating BOSS communication. | A contact attempt; this does not prove an attachment was sent. |
| 9. Draft and review replies | Read the current conversation, generate a grounded draft, edit it, and approve the exact action. | A reply with an observed result, or an explicitly unconfirmed attempt. |
| 10. Continue the conversation | Offer a contact handoff when useful and record its actual completion. | A verified handoff or a closed conversation. Later interview and offer stages remain manual. |

## Why these steps belong together

A job database makes opportunities searchable. Full descriptions support comparisons. A reusable profile helps prepare relevant materials and replies. The queue connects research to applications and conversations.

## User-controlled goals

The user chooses the career direction, target roles, industries, cities, company sizes, contact preferences, and selection criteria. The workflow supports exploring a new field, applying for familiar roles, broad market research, or a narrowly targeted search.

Search filters, ranking criteria, resume emphasis, and drafting goals follow those choices. The workflow does not prescribe an industry, infer what someone should pursue from their background, or make a matching score an eligibility requirement.

Some pages in the original local application contain settings written for one search. Their implementation limits are documented in the [local runbook](docs/local-runbook.md) and [status notes](docs/status.md); they are not defaults for this reusable workflow.

## Read the playbook

- [End-to-end workflow](docs/workflow.md): inputs, actions, and completion criteria.
- [Local operator runbook](docs/local-runbook.md): commands for the existing local application and dashboard routes.
- [Evidence and matching rules](docs/evidence-and-matching.md): what the collector, skill counts, and ranking actually mean.
- [Implementation and verification status](docs/status.md): source coverage, known gaps, and references.
- [Data handling](docs/data-handling.md): what stays local, what reaches a model service, and what is published.

## Reuse the templates

- [Candidate evidence](templates/candidate-evidence.md)
- [Search brief and role review](templates/search-and-role-review.md)
- [Application and conversation review](templates/application-and-conversation.md)
- [AI drafting prompt](prompts/recruiting-draft.md)

Copy templates into your own private workspace before adding personal information. Every example in this repository is generic; no resume, recruiter conversation, account session, or real shortlist is included.

## What is available today

Source inspection found the local collector, relevance-review exports, skill dashboard, company matching, recruiting queue, conversation snapshots, AI drafting, and per-action confirmation. The latest source also contains a path for sending an attachment already stored on BOSS. This attachment path was under active development and has not been established as working on a real account by this review.

The local test suite uses fixtures: controlled pages and sample conversations instead of real recruiters. Passing those checks would not establish that current BOSS pages work with a logged-in account. This documentation release did not run live collection, send messages, send resumes, or operate WeChat.

## Start here

1. Fill in the private candidate-evidence template.
2. Write one search brief and review one role using its full description.
3. If you already have the local `jobtrending` application, follow the runbook. Otherwise, use the same templates with manual searches; no private application code is required to use the method.
4. Record the real outcome after each contact attempt. Do not treat a queued role, generated draft, or clicked button as a successful application.
