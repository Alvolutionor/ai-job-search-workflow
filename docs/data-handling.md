# Data handling

## Public contents

This repository includes the JobTrending application source, dependency lockfile, generic configuration examples, tests, workflow guides, and templates. It includes no original resume, actual shortlist, job-description corpus, conversation transcript, browser session, or model account configuration.

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

Application files were imported using an explicit source/config/test allowlist. The original application's Git history, data directories, personal profile, active search configuration, installed dependencies, and reference checkouts were excluded. Local configuration is initialized from committed generic examples and ignored by Git.

The ignore rules cover common private-data paths and formats. They are a backstop, not a guarantee: inspect staged files and the actual Git tree before every future publication. A generic-looking Markdown file can still contain private data.
