# Implementation and verification status

Integration date: **2026-10-15**. JobTrending source is included at the repository root, alongside the workflow guides.

## Included application

| Component | Location |
| --- | --- |
| Collection/login/enrichment commands | `src/cli/` |
| Database, browser adapters, matching, drafting | `src/lib/` |
| Local server and recruiting routes | `src/server/` |
| Workbench, company view, job library, domain research UI | `src/server/templates/`, `src/server/public/` |
| Generic private-configuration examples | `config/*.example.json` |
| Optional robotics research configurations and rules | Other files under `config/` |
| Review/report scripts and first-run setup | `scripts/` |
| Regression and integration fixtures | `tests/` |
| City lookup data | `vendor/cityGroup.mjs` |

## Changes for public use

- Imported source without the original runtime data, candidate profile, active search configuration, dependency directory, reference checkouts, or Git history.
- Replaced the personalized matcher with user-defined cities, keywords, exclusions, preferred contact titles, and priority terms. No domain, city, or contact preference is enabled by default.
- Made workbench cities dynamic and allowed any supported city or nationwide live search.
- Replaced the personal drafting goal and profile with user-supplied files and a Settings goal.
- Replaced the private resume directory with `data/resumes/` or `JOBTRENDING_RESUME_DIR`.
- Added first-run configuration initialization that preserves existing files.
- Preserved the optional robotics research module as a separate domain example.
- Retained upstream references and license texts in [third-party notices](../THIRD_PARTY_NOTICES.md).

## Verification

Tested on Windows with Node.js 22.12.0:

- `npm ci` installs the locked dependencies and initializes the blank local configuration.
- `npm test`: fourteen tests pass.
- Generic matching retains unrelated careers, cities, and contact types; only configured filters change inclusion.
- Mock live search accepts a city outside the old scope and nationwide search; Settings saves the user goal.
- Empty-data workbench, job library, company view, optional research page, and their APIs return successfully without a BOSS login.
- Existing fixture tests cover context changes, duplicate submission, attachment selection, browser actions, and UI review/handoff.
- Internal links and staged files are checked before publication; local runtime/configuration files are excluded.

## Remaining verification limits

- This integration does not log into a real BOSS account, collect fresh listings, send recruiter messages or attachments, or operate WeChat.
- Browser adapter fixtures do not prove the current logged-in BOSS website still matches every selector.
- The drafting prompt is tested; a real model call from a freshly configured user account is not part of the tests.
- The normal-browser login launcher currently discovers Windows Chrome/Edge paths. Other operating systems are not verified.
- Research export/review/report/audit, cleanup preview, and PDF rendering are tested with synthetic inputs. Real collected corpora and destructive cleanup execution are not exercised.
- Live workbench search reads one page, and inbox snapshots cover loaded conversations/history. The collector handles broader configured collection separately.
- QR recognition, WeChat app control, interview scheduling, and offer management are not implemented.

The original local project remains separate and unchanged. Public-repository changes do not migrate its private database or replace its running service.

The follow-up [repository audit](repository-audit.md) records additional first-run and preference fixes, privacy scope, and clean-clone validation.
