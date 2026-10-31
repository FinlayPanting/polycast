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
- On a real iPhone (27 Oct build): the Plus screen's 'Not now' stays put while you scroll (PC-1026-02); from 28 Oct the All Saints' pick and stamp still show, now as yearly seasons (PC-1026-06). The Duo's wide Plus layout and two-pane player (PC-1026-02, PC-1026-03) only show once builds are resizable on the Duo (SDK 58 work); both were checked in the web preview at 1100 × 820.
- Notes for App Review now end with every date- or time-switched feature and how to see it (PC-1026-05); a day-two first-listen nudge (PC-1026-09) and a kindness check on all notification copy (PC-1026-07) are live on the server.
- On a real iPhone (28 Oct build): a brand-new account's first guided episode starts with the guide's welcome, then just before the host's first words, with 'Play from the very start' for 30 seconds (PC-1027-03); finishing a guided episode from today presses the All Saints' stamp onto the wrap-up with one soft tap, still with Reduce Motion on (PC-1027-08). On the server: Gemini requests carry store: false (PC-1027-01), the day-two nudge names an episode in the language being learnt (PC-1027-02), older video episodes saved twice are merged on the next feed refresh (PC-1027-06), first opens are capped per IPv6 /48 (PC-1027-09).
- On a real iPhone (29 Oct build): Discover's search bar says 'Ask Mia' with the guide's mark, and Discover has a compass icon (PC-1028-03); while an episode prepares, a three-second guess-the-language game sits under the progress card (PC-1028-06); empty Words and Library offer 'Start a good first listen with Mia' (PC-1028-10). On the server and in the checks: the server image copies `patches/` again, so Railway deploys work (they had very likely failed since 24 Oct), `GET /v1/guess-clips`, only allowlisted packages may run install scripts (PC-1028-04), `pnpm check` walks the preview to Mia's first line (10 screens, 10 taps, 2 typed fields; PC-1028-07) and checks every fixed guide line against the written voice guide (PC-1028-09).
- On a real iPhone (with the next build; held on 30 Oct because this month's builds were ahead of pace, and the night run isn't allowed to push `update`): episodes whose feeds still use Podcorn's measurement link keep playing after it dies on 1 Nov (PC-1029-01; the server already skips it); host clips and the guessing game's clip play in full on a slow connection (PC-1029-03); the guessing game has up to five hosts per language and doesn't repeat (PC-1029-04); hold the guide's mark on the wrap-up for a tongue-twister (PC-1029-08; the server voices the twelve clips on its next start). On the server: `/health` says which commit is live and `scripts/live-check.mjs` compares it with a push (PC-1029-05); the Lab makes a 'Mia steps in' vertical video from a stored moment (PC-1029-10).
- On a real iPhone (with the next build; held again on 31 Oct, 14 of 15 builds used and the 15th kept back): More > 'Read the whole episode' shows the full transcript, current line picked out, saved words underlined, tap a line to jump (PC-1030-03); email sign-in is one screen and 'You already know' shows under the tapped language, 8 screens to Mia's first line (PC-1030-04); a 'Fresh' stamp for a guided episode finished the day it came out (PC-1030-08); the wrap-up's '23 other learners heard this one this week' line (PC-1030-09, the count is live on the server). On the server and site (31 Oct): Lab video artwork through safeFetch (PC-1030-01); the decode-uri-component patch shown to cover GHSA-qr28-fpjm-wq7f (PC-1030-02); Eurowaves' picks on Fresh voices, Italian's first shelf (PC-1030-06); 'Learn with this show' links on polycast.app/creators (PC-1030-07); the Lab lists the best three moments for a video first (PC-1030-10).
- Waiting on Finlay (30 Oct): Gladia Solaria-3 in the Lab's transcription audition (`build/PC-1029-09`, on `build/PC-1026-04`, needs `GLADIA_API_KEY`).
- App Store launch week (PC-1025-09): the in-app event and Asset Library header are ready in `docs/APP_STORE.md` and `docs/app-store/`, to load once the app record exists.
- Waiting on Finlay, built on branches: Voxtral transcription in the Lab (`build/PC-1026-04`, built on `build/PC-1022-09`, same `MISTRAL_API_KEY`), Home Screen word widget (`build/PC-1025-08`, App Group and widget App ID), Tell Finlay feedback (`build/PC-1025-05`, migration 0017), auto-download asks the feed whether an episode is video (`build/PC-1025-01`, migration 0016), CarPlay (`build/PC-1022-10`, Apple's CarPlay audio entitlement), Mistral Voxtral voices in the Lab (`build/PC-1022-09`, `MISTRAL_API_KEY`), Support this show (`build/PC-1018-09`, migration 0014), Plus-screen counter (`build/PC-1018-08`, migration 0013), Learning something else? (`build/PC-1023-02`, migration 0015), MAI-Voice-2.1 in the Lab (`build/PC-1024-05`, `OPENROUTER_API_KEY`), the day-two nudge's line in the Monday funnel (`build/PC-1027-04`, migration 0018, which also adds the `prep_jobs` index PC-1027-02 left out), nudges in the learner's own daytime (`build/PC-1028-01`, migration 0019).
- Flaky server tests (PC-1024-10, 25 Oct): the Discover shelves test didn't fail in about 100 runs, alone or four at a time; the order dependency it had (`limit 1` with no order) is gone, and the slow-feed test before it now waits for its background re-read instead of letting it land in a later test. Run four at a time, the Lab's moment preview test (real ffmpeg) went past vitest's 5 s limit 2 times in 24; it now has 20 s, and 24 more busy runs passed. If a server test goes red at random again, note which one here.

## Preview without an iPhone

`EXPO_PUBLIC_DEMO=1 npx expo export --platform web` builds a browser preview with sample data (a fictional Swedish show) and pretend audio. Icons (SF Symbols) don't show on the web. Add `EXPO_PUBLIC_DEMO_SIGNED_OUT=1` (and `--clear`) to start from the welcome screen; any email and code then sign in as a new learner. `node app/scripts/first-line.mjs --json` walks that from first open to Mia's first line and prints every step (PC-1028-07).

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
