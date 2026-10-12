# Build plan

Target: public App Store launch before the On Air Fest pitch (aim 23 Oct 2026). Submit to App Review by about 19–20 Oct.

| # | Milestone | Done when | Status |
|---|---|---|---|
| 1 | Project setup | Monorepo builds; `pnpm check` passes | Done |
| 2 | Core logic | Every rule in the spec that can be expressed as pure logic is implemented and unit-tested | Done (47 tests) |
| 3 | Preparation pipeline | A feed episode becomes transcript, translation, lesson plan and guide audio, with mocks in tests and real providers behind keys; cost ledger and caps enforced | Done with mocks (21 tests); real-provider run waits on API keys |
| 4 | Database and API | Schema, row-level security, API the app needs; free-episode and Plus allowances enforced server-side | Not started |
| 5 | iPhone app | Every screen in the core journey, player with subtitles and guide, word bank, discovery, paywall | Not started |
| 6 | Real services and QA | Real episodes in all six launch languages pass accuracy spot-checks; golden path on Finlay's iPhone via TestFlight; App Store checklist complete | Not started |

## Needs from Finlay

- [ ] Apple Developer Program enrolment, then Small Business Program
- [ ] Expo account (free)
- [ ] Supabase project (free tier, EU region)
- [ ] Google AI Studio API key (Gemini) with a spending limit
- [ ] ElevenLabs API key (Scribe) with a spending limit
- [ ] Podcast Index API key and secret (free)
- [ ] RevenueCat account (free) once the App Store app record exists
- [ ] Figma logo master file
- [ ] About 10 starter shows per launch language
