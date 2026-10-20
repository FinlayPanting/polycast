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
- `source scripts/test-db.sh` first, so the server's database tests run instead of being skipped.

## Board and releases

- The Polycast Board (https://claude.ai/artifact/97Y4qqcc9rja8Z8MRYMjRw, read and written with the ArtifactData tool) is the list of work: collection `items` (status suggested, next, building, backlog, shipped, dismissed) and `settings/main`. Build only what Finlay marked `next` or asked for in chat; set `building` while working and `shipped` (with a one-line `shippedNote`) when pushed.
- What's new (PC-1019-F02): every card shipped to learners adds an entry to `server/changelog.json` in the same commit (`id`, `date` as YYYY-MM-DD of the build, `title`, a one-line plain-English `description`, a short `tryIt` saying where in the app to try it, and `kind` from the card). Changes learners can't see (server-only, security, costs) are left out. The app reads it from `GET /changelog`.
- Live: the server deploys automatically from `rebuild-ios` to Railway (https://polycast-production.up.railway.app). Push only after `pnpm check` passes with the test database running. Database changes go in a new numbered migration in `server/supabase/migrations`; never edit an applied one. A new migration must be applied in the Supabase SQL editor before or with the push, so flag it to Finlay.
- App changes reach phones only through a new TestFlight build. Pushing to the `testflight` branch builds and submits one automatically (Expo Workflows, `app/.eas/workflows/testflight.yml`). At the end of a run that changed the app (`app/` or `packages/core/`), fast-forward it: `git push origin rebuild-ios:testflight`. Server-only changes don't need a build. Each push spends one of the free plan's limited monthly builds, so push once per run, not per commit.

## Rules

- British English in all user-facing text. Warm, plain, adult tone ("You followed most of that", never "Amazing job!!").
- Never ship AI keys in the app. Every AI call goes through the server and is counted against an allowance and the daily spending cap.
- The listen runs from a lesson plan written once per episode. Nothing is generated while a learner listens.
- Episode audio is never stored or re-hosted; it streams from the publisher's feed.
- Every feature lands with tests. Done means its acceptance checks pass.
