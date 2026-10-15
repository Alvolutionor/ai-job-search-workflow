# Evidence and matching rules

## Keep different claims separate

| Observation | What it supports | What it does not establish |
| --- | --- | --- |
| A job was collected on a date | The collector observed that listing then. | The original publication date or current hiring status. |
| A nationwide search completed | That national search task completed. | Complete coverage of all cities or every listing. |
| A job has a 120-character description | It meets the local minimum review threshold. | Relevance or description quality without review. |
| A reviewer accepted a job ID | That reviewer judged its work relevant, with a recorded reason. | That every requirement fits the candidate. |
| A skill is explicitly mentioned | That skill appears in that reviewed job's description. | The candidate has the skill or the whole market demands it at that frequency. |
| A listing labels a contact CEO/CTO | The listing makes that title claim. | Independent identity verification or a guaranteed direct decision-maker conversation. |
| A local project exists | The project is present on the machine. | Candidate authorship or ownership of all its code. |
| A draft was generated | Proposed text is available for review. | A message was sent or received. |
| A send is marked confirmed | The adapter observed its expected confirmation. | A recruiter read it, replied, or offered an interview. |

## Reviewed skill counts

The inspected pipeline uses relevance verdicts and descriptions of at least 120 characters. It preserves job IDs, source URLs, and excerpts for explicit skill matches. A distinct job counts once for each matched skill. The current report/audit code describes 50 skill rules; this is a versioned implementation scope, not a permanent claim about the field.

The live robotics dashboard is scoped to Shanghai/Shenzhen. Broader national/regional crawl configurations also exist. Do not mix their denominators or reuse an older report total as a live dashboard count.

## Current company matching

The matcher first restricts rows to Shanghai/Shenzhen and requires robotics-related text. It excludes detected intermediaries, training/career-coaching roles, and some unnamed-company listings. These are keyword filters with possible false positives and false negatives.

Defaults allow all company sizes, require AI evidence, and do not require a direct contact. The optional small-company filter accepts the listing's `0-20` and `20-99` employee bands. The broader size filter additionally accepts `100-499`.

Eligible jobs are ordered by:

1. Founder/technical-lead title evidence, excluding assistant/secretary titles.
2. Heuristic score, highest first.
3. Most recent local observation.
4. Job ID for a deterministic tie-break.

Rows are then grouped by company ID, falling back to company name.

| Score input in the current source | Adjustment |
| --- | --- |
| Application/platform role title without a specialist title match | +8 |
| Explicit AI/agent/multimodal/voice evidence | +4 |
| Founder or technical-lead contact title | +5 |
| Full-stack/platform/back-end/front-end title | +3 |
| Description mentions selected device, web, or real-time integration technologies | +3 |
| Description has at least 120 characters | +2 |
| Specialist title, such as control/navigation/embedded work | -5 |
| Detected internship/part-time/day-rate/hour-rate role | -6 |

Scores are not calibrated probabilities. The source also emits gaps for incomplete descriptions, missing AI evidence, or deep specialist requirements. Use these gaps to decide what to ask or verify rather than hiding them behind a total score.

## Questions that turn a match into a useful conversation

- What product problem would this engineer own?
- Is the work primarily an application/platform, hardware integration, or a specialized algorithm/control role?
- Which parts of the system need work now, and what would a first contribution look like?
- Does the advertised contact actually lead the relevant team?
- Which requirement is essential immediately, and which can be demonstrated through a project?

Keep unresolved candidate facts separate from unresolved employer facts. Neither should be filled with model guesses.
