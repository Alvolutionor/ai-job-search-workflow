# AI Job Search Workflow

A documented, local-first workflow for turning job-market research into focused applications and useful recruiter conversations.

This repository summarizes an existing Windows setup centered on BOSS Zhipin, a local `jobtrending` project, evidence-backed resumes, and AI-assisted message drafts. It contains the playbook, reusable templates, and an operator runbook. The collector and recruiting application are **not distributed here**; cloning this repository does not install them.

Reviewed on **2026-10-15**. The local recruiting application was being developed during the review, so implementation and live verification are reported separately.

## The workflow

| Step | What happens | Output and decision |
| --- | --- | --- |
| 1. Establish candidate facts | Reconcile the candidate's confirmed history, resumes, project ownership, and engineering evidence. | A private source of truth, with uncertain claims kept separate. |
| 2. Define the search | Choose role families, keywords, cities, and contact preferences. | An explicit search scope rather than an open-ended feed. |
| 3. Collect opportunities | Search BOSS through the candidate's logged-in browser and keep observations locally. | Deduplicated jobs, search provenance, and resumable collection tasks. |
| 4. Read and review descriptions | Retrieve missing job descriptions and judge actual relevance by job ID. | A reviewed corpus; incomplete listings remain candidates. |
| 5. Understand demand | Count explicit skill evidence and attach a practice check to each skill. | A learning backlog grounded in the reviewed sample. |
| 6. Shortlist companies | Group roles by company and compare engineering fit, missing evidence, and contact access. | A small, inspectable application queue. |
| 7. Tailor materials | Maintain AI-application and robotics/smart-hardware resume variants from the same verified history. | A selected PDF and matching BOSS profile text. |
| 8. Start contact | Review a specific role before initiating BOSS communication. | A contact attempt; this does not prove an attachment was sent. |
| 9. Draft and review replies | Read the current conversation, generate a grounded draft, edit it, and approve the exact action. | A reply with an observed result, or an explicitly unconfirmed attempt. |
| 10. Continue the conversation | Offer a contact handoff when useful and record its actual completion. | A verified handoff or a closed conversation. Later interview and offer stages remain manual. |

## Why these steps belong together

A large job database answers “what exists?” A reviewed description answers “what does this role actually require?” A verified candidate profile answers “what can I truthfully offer?” The conversation connects those answers to a real company's work.

The working search direction combines existing full-stack and cloud engineering experience with AI applications and robotics/device platforms. It does not assume that software integration experience proves current expertise in robot control, navigation, embedded firmware, or model research.

The focused company search currently covers Shanghai and Shenzhen. Direct access to founders or technical leads is prioritized; company size is unrestricted by default. Small-company and direct-contact filters can narrow the set when wanted. These are configurable preferences, not guarantees about company quality or recruiter identity.

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
