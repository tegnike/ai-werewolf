# Fable consultation request

## Role

Act as a read-only advisory subagent. Do not edit files or run commands. Inspect only the explicitly named repository files and screenshot as needed.

## Objective

Evaluate the currently implemented AI Werewolf game as a spectator product, propose concrete improvements, and rank them in the order they should be implemented.

The two primary evaluation questions are:

1. Because nine AI players run the game automatically, can a first-time viewer easily understand what is happening, why it matters, and what changed?
2. Does the presentation make the things viewers seek from a standard Werewolf game enjoyable: deduction, suspicion, lies, role claims and counterclaims, interpersonal reactions, voting tension, night secrets, reversals, deaths, and the final role reveal?

## Why Fable

This needs independent product judgment, information-design critique, and entertainment-direction judgment across UI, event presentation, pacing, and existing game behavior. Codex will retain responsibility for implementation and verification after receiving the advice.

## Known facts and constraints

Confirmed facts:

- This is a desktop-only, self-hosted Next.js application in which nine fixed AI agents autonomously play a standard nine-player Werewolf game.
- Roles are three villagers, two werewolves, one seer, one medium, one bodyguard, and one madman.
- The human viewer can start, pause, resume, abort, watch live, switch public/GM viewpoints, and replay saved event streams.
- Public and secret information are separated server-side. Do not recommend weakening this boundary.
- Live speech can be read by nine distinct VOICEVOX voices, synchronized with the displayed speech. Original ambient BGM is present.
- The current viewer has a 3x3 player-card board, latest speech per player, life/role badges, a right-side reverse-chronological event log, vote tally bars, phase header, result banner, and replay controls.
- Current screen at the end of a replay: `tmp/fable-call/current-view.png` (1440x900).
- Development, tests, CI, UI checks, and repeated simulations must use MockAI only.
- Real AI is reserved for one final acceptance match under a double opt-in gate. Do not recommend iterative real-AI testing.
- OpenAI production model and effort are fixed. Do not recommend changing model or adding fallback models.
- The standard rules, role names, and lack of a custom story/world are fixed. Do not propose new roles, altered win conditions, viewer participation, chat, mobile design, accounts, rankings, or unrelated scope.
- Secret roles must not appear in public view before the match ends.
- Repository is currently clean apart from consultation artifacts under `tmp/fable-call/`. No push is allowed.

Assumptions to challenge if needed:

- The current screen may be visually polished while still under-explaining causal relationships.
- Improvements may involve derived presentation computed from existing events, small new public events, prompt/narration changes, or larger features, but should preserve deterministic rules and information boundaries.

## Relevant context

Use these exact files:

- `docs/implementation-plan.md` — authoritative product, rule, UI, and security specification; especially sections 0, 3, 4, 5, and 8.
- `docs/acceptance-report.md` — current validation status.
- `README.md` — implemented features and operation.
- `src/ui/MatchViewer.tsx` — main live/replay spectator UI and event formatting.
- `src/ui/presentation.ts` — speech/VOICE presentation gating.
- `src/ui/HomeScreen.tsx` — match launch and archive.
- `src/app/globals.css` — full current visual design.
- `src/engine/game.ts` — actual game loop and emitted event payloads.
- `src/server/view.ts` — public/GM projection boundary.
- `src/server/ai/prompts.ts` — AI discussion/decision prompts and available narrative behavior.
- `src/server/ai/mock.ts` — deterministic development behavior.
- `test/e2e/app.spec.ts` and `test/unit/presentation.test.ts` — current observable coverage.
- `tmp/fable-call/current-view.png` — current rendered replay screen.

## Questions

1. What are the most important spectator-comprehension problems in the current implementation, and what concrete change solves each one?
2. What is missing or under-emphasized in expressing the fun viewers expect from Werewolf, and what concrete presentation or behavior change would improve it without changing the standard rules?
3. Rank all recommended improvements in implementation order using both expected spectator impact and implementation ease. Explicitly distinguish quick wins from medium and large work.
4. For each recommendation, identify the likely files/components, event data needed, public-vs-GM behavior, acceptance criteria, and key risk.
5. Which coherent subset should Codex implement immediately in this session for the best impact-to-effort ratio? Include exact sequencing and indicate which items should deliberately wait.

## Required response

- Lead with a concise assessment of the current product.
- Provide one ranked table with: rank, recommendation, viewer problem solved, expected effect (1-5), implementation ease (1-5 where 5 is easiest), why this rank, and estimated scope.
- Make recommendations implementation-ready, not generic. Cite repository file paths and line numbers when possible.
- Explicitly cover both public view and GM view and never leak secrets into public view.
- Explicitly identify how the recommendation makes a standard Werewolf match more understandable or more entertaining.
- End with an immediate implementation batch small enough for one coding session, ordered step-by-step, plus deferred items.
- Explain key reasoning and trade-offs.
- Identify assumptions, risks, and missing evidence.
