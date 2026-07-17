# Fable consultation request

## Role

Act as a read-only advisory subagent. Do not edit files or run commands. You may inspect the named repository files available in the working directory, but return only an implementation plan and critique.

## Objective

Design an implementation-ready, backward-compatible strategy system for a standard Japanese 9-player werewolf game so that true-role CO timing, madman/werewolf counterclaims and concealment, false divination/medium results, claim consistency, speaking opportunities, public projection, persistence, and evaluation work together naturally without making a new deterministic tell.

The concrete defect is that after replacing two fixed speech rounds with an opening round plus dynamic free discussion, the true seer nearly always explicitly claims while madmen and werewolves almost never counterclaim. Experienced spectators can therefore treat the lone seer claim as almost confirmed truth.

## Why Fable

This needs independent architectural and game-design judgment across hidden information, probabilistic tactics, prompt contracts, deterministic replay, API budgets, backward compatibility, and spectator clarity. Codex will verify and adapt the advice against the repository before implementation.

## Known facts and constraints

### Confirmed facts

- Repository: `/Users/user/WorkSpace/ai-werewolf`; branch `main`; current HEAD `28232b4`; worktree is clean at consultation time.
- `docs/implementation-plan.md` is the source of truth.
- This is ordinary 9-player werewolf only: villager 3, werewolf 2, seer 1, medium 1, bodyguard 1, madman 1. Do not invent roles, lore, or bespoke rules.
- Opening discussion gives every survivor one deterministic rotating-order speech. Free discussion then has at most survivor-count additional speeches; each player gets at most two; at most two intent polls per day with four candidates each. Addressed replies are prioritized. Total public speeches are at most twice survivor count.
- Speech currently returns `speech`, `addressedTo`, and `requestsReply`. Intent returns `urgency`, `motivation`, and `targetSeat`.
- Existing role-policy prose encourages madman deception, but there is no durable claim ledger or private deception plan. `src/server/ai/disclosure.ts` requires an explicit Japanese role claim when a seer/medium result is disclosed. The general prompt's private-facts restriction may discourage strategic false assertions.
- Claims currently live only in free-form public speech. Public view filtering must never prove whether a claim or result is true.
- The engine is event-sourced through SQLite events, supports replay/resume/idempotent AI calls, and must remain compatible with old saved matches/events.
- Development, automated tests, CI, E2E, and repeated simulations must use MockAI only.
- Real AI is allowed only at final acceptance with both explicit `--ai real` and `ALLOW_REAL_AI=1`. Production model is fixed to `gpt-5.6-luna`, `reasoning.effort='low'`, with no model fallback.
- Do not use `Math.random()` in `src/`; stochastic behavior must be deterministic from the match seed.
- Secrets remain server-side. Never log API keys, prompts, AI response bodies, or secret roles.
- Physical AI calls abort before 240. Current intent/speech call budgets should not grow materially.
- If an AI decision is invalid, repair/retry must be bounded and must not substitute random gameplay or another model.
- Madman does not know werewolf identities and must be able to accidentally blacken a wolf or white-cover one.
- A local server is currently listening on port 3001, but runtime state is outside this advisory task.

### Scope

- True seer and true medium CO timing.
- Madman and situational werewolf seer/medium deception, including concealment.
- Public structured claims separated from private truth/belief.
- Durable public claim ledger plus private deception plan or an alternative durable representation.
- Counterclaim opportunity in the dynamic speaker scheduler without broad repolling.
- Event schema, AI schemas/prompts, MockAI, engine, persistence/replay, public view, UI, and metrics/tests.
- Safe migration/defaulting for old event streams and interrupted matches.

### Non-goals

- Changing role composition or fundamental game rules.
- Optimizing win rates with real-AI batch experiments.
- Introducing free-form chain-of-thought or logging hidden rationale.
- Making every madman or werewolf claim, or simply lowering true-seer CO frequency in isolation.

## Relevant context

Inspect these files as needed:

- `docs/implementation-plan.md` sections 3.5, 3.9, 3.10, 4, 7.5-7.7, 8.5-8.6, 10-11
- `docs/spectator-experience-backlog.md` section 8
- `src/domain/types.ts`
- `src/domain/events.ts`
- `src/domain/role-behaviors.ts`
- `src/engine/game.ts`
- `src/engine/state.ts`
- `src/engine/prng.ts`
- `src/server/ai/schemas.ts`
- `src/server/ai/prompts.ts`
- `src/server/ai/disclosure.ts`
- `src/server/ai/client.ts`
- `src/server/ai/mock.ts`
- `src/server/db.ts`
- `src/server/repo.ts`
- `src/server/runner.ts`
- `src/server/view.ts`
- `src/ui/MatchViewer.tsx`
- `src/ui/types.ts`
- `test/` and `package.json`

Existing relevant commits are `73a0188` (dynamic free discussion) and `28232b4` (force MockAI in Playwright).

## Questions

1. What decision model yields natural but non-monotonic CO/counterclaim/concealment behavior in ordinary 9-player werewolf? Distinguish true seer, true medium, madman, and two werewolves across day, result type, existing claims, execution pressure, attack risk, credibility, partner state, and personality.
2. Which parts should be deterministic validation/policy, seeded probability, and structured AI judgment? Explain why, and avoid probabilities that become a new easily learned tell.
3. What is the smallest backward-compatible domain model that cleanly separates private truth, private tactical intention, public assertion, and derived public claim ledger? Specify concrete TypeScript shapes and ownership/visibility.
4. Should private deception state be an event, derived state, a separate table, or AI-call output? Explain persistence, resume, replay, idempotency, information-boundary, and old-match implications.
5. Define a structured speech/claim contract for CO, counterclaim, result report, correction, retraction, and optional slide if you recommend it. How should text/schema disagreement be handled without accepting impossible claims or leaking truth?
6. How should false result targets and values be created and kept consistent across days? Define validation for dead/alive timing, self-targeting, repeated targets/results, medium eligibility, future knowledge, and deliberate correction/retraction.
7. How can the current speaker scheduler guarantee a timely counterclaim/correction opportunity while preserving current daily speech and intent-poll ceilings and avoiding an all-player repoll after every claim?
8. How should prompts reconcile `use only public information and private facts` with authorized strategic lying? Provide precise prompt-contract principles, not merely flavor prose. Keep private rationale short and structured.
9. What exact event additions or payload extensions, reducer/state changes, public projection rules, UI presentation, and replay behavior are needed? The UI must show only `this character claimed X`, never truth confirmation.
10. What bounded validation/repair/retry behavior is safest when structured claim output is invalid, text contradicts annotations, or a model proposes an impossible result? No model fallback and no secret-bearing logs.
11. How should MockAI deterministically reproduce at least these lanes: lone true-seer claim, madman counterclaim, werewolf counterclaim, all deceptive roles concealed, accidental madman wolf-black/white-cover, durable multi-day false history, counterclaim priority, and invalid claim rejection/repair?
12. Propose measurable acceptance targets and a multi-seed Mock simulation report for true-seer day-1 CO, counterclaim, apparently-confirmed lone claim, role/day distribution, contradiction/impossible-claim rate, completion, and daily call/speech budgets. Explain which distribution metrics are meaningful with scripted MockAI versus reserved for a tiny real-AI sample.
13. Give an incremental implementation order that minimizes schema/replay risk, including exact files and test layers. Identify recommendations that should be rejected or deferred if they add too much complexity for this codebase.
14. Identify the highest-risk hidden-information leaks, game-design failure modes, and migration traps in this change.

## Required response

- Lead with the recommended architecture and decision model.
- Give concrete TypeScript data shapes, events, validators, scheduler changes, prompt contracts, and persistence/replay rules.
- Separate must-have MVP work from later refinements.
- Include a file-by-file implementation sequence and test matrix.
- Include suggested numerical acceptance ranges, while clearly labeling assumptions and what MockAI cannot validate.
- Explain key reasoning and trade-offs.
- Identify assumptions, risks, missing evidence, and recommendations to reject or defer.
- Cite repository file paths and line numbers when possible.
- Do not edit files or run commands.
