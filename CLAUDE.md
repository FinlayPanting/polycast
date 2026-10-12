# Polycast

Language learning through real podcasts: subtitles plus a spoken guide (Mia, Leo) that steps in at natural pauses. Native iPhone app on the App Store.

## Source of truth

The product spec is a Claude Doc: https://claude.ai/code/artifact/ad442817-a488-4a93-8bb4-a445e998d51b (tabs: spec, Research). If code and spec disagree, the spec wins. If the spec is silent, pick the simplest option that fits its product principles and note it in `docs/DECISIONS.md`.

Build progress and milestones: `docs/BUILD_PLAN.md`.

## Layout

- `packages/core` — pure TypeScript shared by server and app. No network, no platform APIs. Lesson plan types, guide levels and spacing, natural breaks, host clips, allowances, costs, difficulty, word review, flags, RSS and chart parsing.
- `server` — episode preparation pipeline and API (Supabase). AI providers sit behind interfaces in `server/src/providers`; tests use mocks, never real keys.
- `app` — Expo (React Native) iPhone app.
- `legacy-web` — the May 2026 web proof of concept, kept for reference only. Do not build on it.

## Commands

- `pnpm install`
- `pnpm check` — typecheck and test every package. Run before every commit.
- `pnpm --filter @polycast/core test`

## Rules

- British English in all user-facing text. Warm, plain, adult tone ("You followed most of that", never "Amazing job!!").
- Never ship AI keys in the app. Every AI call goes through the server and is counted against an allowance and the daily spending cap.
- The listen runs from a lesson plan written once per episode. Nothing is generated while a learner listens.
- Episode audio is never stored or re-hosted; it streams from the publisher's feed.
- Every feature lands with tests. Done means its acceptance checks pass.
