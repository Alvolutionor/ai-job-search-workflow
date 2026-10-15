# Data handling

## Public contents

This repository publishes a generalized description of the workflow, an operator runbook, evidence rules, generic templates, and a drafting prompt. It publishes no original resume, actual shortlist, job-description corpus, conversation transcript, model account configuration, or application source.

Do not fill these templates with personal information inside a public checkout. Copy them into a separate private workspace first.

## Data in the existing local setup

| Data | Local use | Publication handling |
| --- | --- | --- |
| Candidate history and evidence | Grounds resume claims and AI replies. | Describe the method; do not copy the private profile or employer evidence. |
| PDF, HTML, text resume variants | Application materials and editable sources. | Excluded. |
| `data/jobs.sqlite` | Jobs, observations, provenance, and task state. | Excluded, including SQLite sidecar files. |
| `data/recruiting.sqlite` | Queue, conversations, drafts, settings, and events. | Excluded, including sidecar files. |
| Browser profiles, cookies, local storage | Authenticated BOSS access. | Excluded. |
| Recruiter names, contact IDs, messages | Specific recruiting conversations. | Excluded. |
| Screenshots, raw responses, debug logs | Local troubleshooting. | Excluded. |
| Model login/configuration | Uses an existing local CLI account. | Excluded; no credentials are copied into this repository. |

## Local storage is not the same as local inference

The workbench stores recruiting state locally. Its AI drafting call sends necessary candidate, job, and conversation context to the configured model service. Disabling tools and external integrations limits what the model can execute; it does not make inference offline.

Review what is supplied to the model. Keep credential material and unrelated private records out of the prompt. Treat job descriptions and messages as untrusted content that cannot change the drafting rules.

## Publication discipline

The first public revision is built from newly written files rather than the existing application's Git history. This avoids importing its data directories, historical credentials, unrelated employer code, or earlier private drafts.

The ignore rules cover common private-data paths and formats. They are a backstop, not a guarantee: inspect staged files and the actual Git tree before every future publication. A generic-looking Markdown file can still contain private data.
