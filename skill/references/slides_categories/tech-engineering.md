# Tech & Engineering

**Audience:** engineers, architects, reviewers, technical leaders, and operators.
**Reader task:** see structure, dependencies, metrics, and trade-offs clearly
enough to evaluate or execute the design. **Default style:** `swiss-minimal` or
`blueprint` in `../design.md`.

## Narrative

Choose the engineering question first:

```text
context/requirements → current state or constraint → proposed architecture →
critical flows/dependencies → evidence/benchmarks → trade-offs/risks →
rollout/migration → decision or next step
```

An architecture review needs interfaces and failure modes; an R&D report needs
method and experimental evidence; an operations review needs service levels and
mitigation. Do not force all three into one deck.

## Page types

| Page | Job |
|---|---|
| Title / decision | System, scope, review question, author/date, and one precise claim. |
| Requirements | Functional scope, non-functional targets, constraints, and exclusions. |
| Current state | Existing architecture, bottleneck, incident/evidence, or baseline. |
| Proposed architecture | Components, ownership, interfaces, data/control flow, and trust boundaries. |
| Critical flow | One request, job, deployment, failure, or migration sequence. |
| Evidence | Benchmarks, tests, prototype results, SLOs, capacity, or comparison. |
| Trade-offs / risks | Alternatives, failure modes, security, cost, complexity, and mitigations. |
| Rollout / decision | Phases, gates, rollback, owners, dates, and explicit review ask. |

Optional data model, API details, dependency inventory, threat model, and backup
benchmarks. Put exhaustive protocol detail in an appendix.

## Content and evidence contracts

- State the unit of scale: requests/s, concurrent users, jobs, nodes, bytes,
  latency percentile, or another meaningful basis.
- Distinguish measured results, load-test projections, estimates, and design
  targets. A target is not a benchmark.
- Architecture components have named ownership and interface direction. Arrows
  do not imply a sequence unless the flow actually has that sequence.
- Benchmarks show environment, dataset/load, versions, repetitions, baseline,
  and uncertainty. Never invent production metrics.
- Trade-offs compare options on the same constraints. Include operational and
  migration complexity, not only runtime performance.
- Security and privacy zones show trust boundaries, credentials, sensitive data,
  and failure behavior without exposing real secrets.
- Rollout includes observable gates, rollback conditions, one owner per phase,
  and absolute dates when dates are required.
- Every diagram, screenshot, and benchmark has a caption and source where it is
  evidence. Generated imagery never substitutes for a real system artifact.

## Layout recipes

- **Requirements:** target metric rows with current baseline and required target;
  or scope left/non-functional constraints right. Keep exclusions visible.
- **Current state:** architecture diagram 60–70% with bottleneck callouts; or
  incident timeline above and contributing factors below.
- **Proposed architecture:** layered or zone-based diagram with one dominant
  data/control direction; interface/ownership ledger beside or below it.
- **Critical flow:** numbered sequence across the page; swimlanes for ownership;
  or state diagram for lifecycle work. Show failure/rollback as an explicit path.
- **Evidence:** one chart/table occupies 55–75%, with environment and reading
  beside it. Use shared baselines and units across comparison pages.
- **Trade-offs:** options matrix with independent criteria, or decision record
  with chosen/rejected options and reasons. Show the strongest counter-case.
- **Rollout:** horizontal phases with gates and rollback below, or migration
  ladder with owners and verification steps.

Use dashed guides and callouts only when they clarify technical relationships.
No decorative HUD frames, filler icons, or gradient glow.

## Palette, typography, and density

Use `swiss-minimal` for documentation and research systems; use `blueprint` for
engineering walkthroughs; use `dark-tech` only for a verified projection/demo.

A neutral blue-gray, ink green, or graphite primary works well. Signal color is
reserved for a bottleneck, failure path, or decisive series. Use a neutral sans
with monospaced technical identifiers only where useful, within two families.

Cover 40–56px; page title 28–36px; body 15–18px; technical labels 12–14px;
source 9–11px; key metric 40–64px. Use a fixed exhibit number, interface tag,
or review-status block as the motif.

## Anti-homogenization and QA

- Use at least four layout grammars in a ten-page deck: diagram, sequence,
  evidence, matrix, decision, and rollout as needed.
- No two consecutive pages share a composition; never run three architecture
  boxes-and-arrows pages without changing the question and emphasis.
- Verify every arrow direction, unit, percentile, environment, and source.
- End with the technical decision, gate, or next engineering action.
