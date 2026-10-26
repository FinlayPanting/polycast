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
- App Store listing: screenshots, description (first draft in docs/APP_STORE.md), privacy labels, reviewer demo account. App Review notes covering every feature and Mia's safeguards are written (PC-1018-05, 21 Oct), ready to paste.
- On a real iPhone: background play with the screen locked, headphone presses, the guide's voice over a paused episode, Sign in with Apple, purchases. The two audio libraries share the iPhone's audio session; if they fight, swap the guide's voice onto the track player (one file to change).
- Mia matches the show's volume (PC-1017-F16): step 1 is built (measured loudness, matched guide level); step 2, boosting very quiet episodes with a native gain on iOS, isn't.
- Listen later and followed shows (PC-1017-F09, F10) are kept on the phone; moving them to the account (a migration) would carry them to a new phone and let new-episode nudges use follows.
- Over-the-air updates (PC-1020-U1, 21 Oct): live from the first TestFlight build that includes expo-updates. Verify once on a phone that a JavaScript-only change pushed to the `update` branch arrives on the second open. The nightly build run now decides with `node scripts/release-target.mjs <start>` (22 Oct); the script also counts lock-file, root package, `app/targets` and `app/native` changes as native (PC-1021-01).
- On a real iPhone (22 Oct build): the Siri and Spotlight shortcuts (PC-1021-09; native Swift written without a Mac, first compiled by the TestFlight build), and that episode requests name Polycast in hosts' stats (PC-1019-04). The OPAWG list entry in `docs/OPAWG.md` is ready to send.
- Lock-screen transcript test (PC-1020-L1): built on branch `build/PC-1020-L1`, waiting on the LiveLine extension's App ID and provisioning profile.
- On a real iPhone (23 Oct build): the shortcuts now compile for the iOS 15.1 minimum (iOS 16 and up only, PC-1022-03); check "Play the newest <show>" learns a show followed after install; the new "You already know some …" step after picking a language (PC-1022-08) plays each word in the host's voice.
- On a real iPhone (24 Oct build): links with odd characters still open the right screen (patched decode-uri-component, PC-1023-07); the player on a short screen (PC-1019-05; the iPhone Duo's outer display, if one's to hand). Builds are pinned to EAS's Xcode 26.6 image (`sdk-57`) until the layout adapts to any shape.
- On a real iPhone (25 Oct build): with VoiceOver on, subtitles, primer words and saved words are read in their own language and meanings in English (PC-1024-04); from 28 Oct, finishing a guided episode adds a stamp in You (PC-1024-07).
- On a real iPhone (26 Oct, over-the-air update, no new build): finish a guided episode after 11 pm and the guide says goodnight (PC-1025-06; the twelve clips are voiced by the server on its next start).
- App Store launch week (PC-1025-09): the in-app event and Asset Library header are ready in `docs/APP_STORE.md` and `docs/app-store/`, to load once the app record exists.
- Waiting on Finlay, built on branches: Home Screen word widget (`build/PC-1025-08`, App Group and widget App ID), Tell Finlay feedback (`build/PC-1025-05`, migration 0017), auto-download asks the feed whether an episode is video (`build/PC-1025-01`, migration 0016), CarPlay (`build/PC-1022-10`, Apple's CarPlay audio entitlement), Mistral Voxtral voices in the Lab (`build/PC-1022-09`, `MISTRAL_API_KEY`), Support this show (`build/PC-1018-09`, migration 0014), Plus-screen counter (`build/PC-1018-08`, migration 0013), Learning something else? (`build/PC-1023-02`, migration 0015), MAI-Voice-2.1 in the Lab (`build/PC-1024-05`, `OPENROUTER_API_KEY`).
- Flaky server tests (PC-1024-10, 25 Oct): the Discover shelves test didn't fail in about 100 runs, alone or four at a time; the order dependency it had (`limit 1` with no order) is gone, and the slow-feed test before it now waits for its background re-read instead of letting it land in a later test. Run four at a time, the Lab's moment preview test (real ffmpeg) went past vitest's 5 s limit 2 times in 24; it now has 20 s, and 24 more busy runs passed. If a server test goes red at random again, note which one here.

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
