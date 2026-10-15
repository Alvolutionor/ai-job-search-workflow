# Repository audit

Reviewed on 2026-10-15 after integrating JobTrending.

## Scope and method

- Inventory tracked source, scripts, configuration examples, UI assets, documents, tests, and third-party files. Compare application file paths with the local source import.
- Scan current files and reachable Git-history blobs for private names/machine paths, credential formats, contact assignments, and email addresses. Classify matches instead of treating every keyword as a leak.
- Trace first-run setup, database initialization, job collection/enrichment, matching, model drafting, recruiting actions, research exports, and reports.
- Check relative imports, configuration dependencies, command names, JavaScript syntax, and document links.
- Validate a clean clone with locked dependency installation, tests, and an actual server process. Use synthetic inputs and intercepted browser pages for integration tests.

## Eight follow-up findings addressed

| Finding | Change and verification |
| --- | --- |
| A new database lacked detail columns until it was reopened. | Run migrations after initial schema creation. A fresh-database regression test captures details and immediately queries them. |
| Detail enrichment secretly favored robotics and demoted sales/product roles. | Remove role-title weighting. Selection balances keywords/cities and observation time; a regression test retains neutral ordering. |
| The optional research module retained a fixed two-city scope and geographic output filename. | Use private `research.config.json` or `JOBTRENDING_RESEARCH_CONFIG`, derive the displayed scope, and use a non-geographic live-verdict filename. |
| PDF output retained an environmental-industry title and a preferred city order. | Accept input/output/title arguments and retain input city order. The PDF test checks the supplied title and generated PDF bytes. |
| Research commands required a database that installation did not create. | Initialize the local empty database during setup and expose the missing batch pipeline commands. An isolated first-run pipeline test runs the scripts. |
| The skill audit rejected valid zero-match skills. | Allow zero counts while retaining evidence/count checks. The fixture pipeline includes zero-match skills. |
| Reviewed-evidence export could accept malformed verdict values. | Validate boolean relevance, nonempty reasons, duplicate IDs, and exact candidate coverage. A negative fixture is rejected. |
| Browser discovery and supported Node versions depended on the original environment. | Discover installed browsers on Windows/macOS/Linux, support an explicit path and installed Chromium, declare supported Node 20/22 lines, reuse that browser for collection/PDF, skip the duplicate Puppeteer download, and add clean-install CI jobs. Local execution is verified; platform results are tracked in Actions. |

## Dependency audit

The original lockfile reported 13 affected packages, including one critical finding. Compatible dependency updates and a patched `qs` override remove the critical, moderate, and low findings. The remaining audit reports 9 high-severity affected packages across two underlying advisory families: `basic-ftp` and `extract-zip`, propagated through Puppeteer's proxy/browser-download dependency chain. The installer therefore is not reported as having a clean security audit.

`npm audit fix` provides no compatible automatic resolution for those remaining chains. The repository retains the reference browser stack and records the limitation rather than asserting unverified compatibility with a replacement. Dependency changes are covered by the clean-install and application tests; those tests do not prove the upstream advisories unexploitable.

## Privacy findings

The scan found no matching private candidate names, private machine paths, or credential tokens in the tracked content/reachable history examined. Two content-pattern matches were classified as a dependency publisher's public address in npm metadata and a fabricated contact in a test fixture.

The public GitHub repository identity and its Git author name/GitHub noreply address remain in repository metadata. Earlier commits retain earlier documentation and search examples; history has not been rewritten. Those examples do not configure the current application.

Runtime databases, browser profiles, cookies, local storage, resumes, personal profiles, and active search/matching/recruiting/research configuration are ignored by Git. Committed examples contain blank personal fields or clearly identified domain sample settings. Vendor city data and sample city lists support lookup/examples; they do not select a user's target city.

The startup URL now prints the bound IPv4 loopback address explicitly, avoiding clients resolving `localhost` to an IPv6 address the server does not bind.

## Verification and limits

Fourteen local tests pass, including the original recruiting fixtures and new first-run/research tests. The research fixture covers export, candidate preparation, verdict validation, reviewed export, report generation, skill audit, pending export, cleanup preview, and PDF rendering.

Clone/install/start validation establishes that a new user can open the local application with empty data and no private files. Actual collection still requires that user's BOSS login and chosen search terms. AI drafting requires that user's authenticated Claude installation and supplied profile.

The GitHub Actions workflow tests fresh installations on Windows, Ubuntu, and macOS with Node 20 and 22. Refer to the current Actions result for remote platform outcomes.

Not covered: real account login/security challenges, live-site selector changes, actual recruiter delivery, real model-provider availability, destructive cleanup, full market coverage, every browser version, or every possible input combination. This audit reports the inspected scope and reproduced fixes; it does not establish that no other defects exist.
