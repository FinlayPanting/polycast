# Build plan

Target: public App Store launch before the On Air Fest pitch (aim 23 Oct 2026). Submit to App Review by about 19–20 Oct.

| # | Milestone | Done when | Status |
|---|---|---|---|
| 1 | Project setup | Monorepo builds; `pnpm check` passes | Done |
| 2 | Core logic | Every rule in the spec that can be expressed as pure logic is implemented and unit-tested | Done (47 tests) |
| 3 | Preparation pipeline | A feed episode becomes transcript, translation, lesson plan and guide audio, with mocks in tests and real providers behind keys; cost ledger and caps enforced | Done with mocks (21 tests); real-provider run waits on API keys |
| 4 | Database and API | Schema, row-level security, API the app needs; free-episode and Plus allowances enforced server-side | Done (22 tests against real Postgres) |
| 5 | iPhone app | Every screen in the core journey, player with subtitles and guide, word bank, discovery, paywall | Built; iOS bundle compiles; web demo preview screenshotted. Waits on a device build to verify audio, sign-in and purchases |
| 6 | Real services and QA | Real episodes in all six launch languages pass accuracy spot-checks; golden path on Finlay's iPhone via TestFlight; App Store checklist complete | Not started |

## Still to build or verify

- Offline downloads for Plus (spec: My library). Not built yet; left off the Plus screen until it is.
- Starter shelf: a script to add Finlay's picks and pre-prepare their recent episodes through Gemini's batch service.
- Website pages the app links to: privacy policy, terms, creators (removal requests). Written in `site/` (18 Oct), hosted on Vercel at polycast.app; Finlay to review the legal wording.
- App Store listing: screenshots, description (first draft in docs/APP_STORE.md), privacy labels, reviewer demo account.
- On a real iPhone: background play with the screen locked, headphone presses, the guide's voice over a paused episode, Sign in with Apple, purchases. The two audio libraries share the iPhone's audio session; if they fight, swap the guide's voice onto the track player (one file to change).
- One server test (Discover shelves) failed once in about a dozen runs and hasn't reproduced; watch for it.

## Preview without an iPhone

`EXPO_PUBLIC_DEMO=1 npx expo export --platform web` builds a browser preview with sample data (a fictional Swedish show) and pretend audio. Icons (SF Symbols) don't show on the web.

## Needs from Finlay

- [ ] Apple Developer Program enrolment, then Small Business Program
- [ ] Expo account (free)
- [ ] Supabase project (free tier, EU region)
- [ ] A host for the Polycast server (Railway, Fly.io or Render; it runs the API and worker from `server/Dockerfile`)
- [ ] Google AI Studio API key (Gemini) with a spending limit
- [ ] ElevenLabs API key (Scribe) with a spending limit
- [ ] Podcast Index API key and secret (free)
- [ ] RevenueCat account (free) once the App Store app record exists
- [ ] Figma logo master file
- [ ] About 10 starter shows per launch language
