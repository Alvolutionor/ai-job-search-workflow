# Evidence and matching

## Start with the user's criteria

The user defines relevance and priority. Industry, role, location, compensation, company size, working arrangements, and contact access are possible criteria, not built-in preferences.

For each condition, distinguish:

- **Filter:** exclude results only when the user has chosen that exclusion.
- **Ranking signal:** change the order while leaving the other results accessible.
- **Information:** show the field without affecting inclusion or order.

A candidate's background can inform comparisons and drafting. It does not set a limit on the roles they can explore or apply for. A career change or stretch application does not need approval from the matching system.

## Make results inspectable

Show the original listing, the matching criterion, the supporting text, and any missing fields. If a score is used, document its inputs so the user can understand what caused the ordering.

Keep search relevance separate from candidate similarity: a listing can match the search perfectly while asking for experience the candidate has not listed. The user decides what to do with that information.

The included matcher reads `config/matching.config.json`. Empty lists retain all jobs. Keywords and exclusions control inclusion; priority terms contribute one point per matching term. Preferred contact titles affect ordering only when `prioritizeContacts` is enabled, and restrict results only when the user selects that contact filter. No industry, city, or contact title is built in as a preferred choice.

## Preserve useful source information

| Field or record | Meaning |
| --- | --- |
| Job ID | Identifies a listing across search results and review files. |
| Search keyword and city | Records how the listing was found. |
| First/last observed time | Records when the collector saw it. |
| Publication date, if available | A separate date supplied by the platform. |
| Relevance decision and reason | Records a review against the selected search brief. |
| Skill excerpt | Shows which description supported a skill count. |
| Send result | Separates an attempted action from an observed platform confirmation. |

## Research counts

Count a distinct job once per skill and retain its source text. Report the reviewed sample and search scope alongside the counts. Keep incomplete and pending records visible so the user knows what was included.

Domain-specific skill rules, minimum description lengths, and review definitions belong to the selected research configuration. They describe that sample and should not become universal job-selection requirements.

## Compare opportunities

Useful comparison fields include responsibilities, compensation, location, working arrangements, product or industry, experience requirements, company information, and questions the user wants answered. Use whichever fields matter to that search.

The output is an organized set of options. The user chooses which opportunities to pursue and how to communicate.
