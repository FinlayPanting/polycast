<p align="center">
  <img src="app/assets/icon.png" alt="Polycast" width="120" />
</p>

<h1 align="center">Polycast</h1>

<p align="center"><strong>Learn a language through the podcasts people there actually listen to.</strong></p>

<p align="center">Native iPhone app · Spanish, French, German, Italian, Portuguese and Swedish · Coming soon to the App Store</p>

---

Polycast puts subtitles on real podcasts, with your own language underneath, like watching a foreign film. Your guide, **Mia** or **Leo**, steps in at natural pauses: a word to listen for, a quick recap of what you might have missed, a phrase replayed in the host's own voice.

**The host is real. Mia and Leo only step in when the host pauses.**

It's built for learning for fun, not homework: put your headphones in, pick a show you'd enjoy anyway, and let the language wash over you with a friendly guide at your shoulder.

> **Status:** in TestFlight ahead of a public App Store launch in October 2026. The May 2026 web prototype lives on in [`legacy-web/`](legacy-web) for reference.

---

## What a listen feels like

1. **Pick a show.** Discover has hand-picked starter shows, each country's top charts, shelves built from your interests, and a box where you can just tell Mia what you're in the mood for ("a calm story for the train"). Any show with a public feed works too.
2. **Read the primer.** Before you press play, Mia gives you the gist in simple words, the words to listen for (tap one to hear the host say it), and a map of what comes up and when. Tap any point on the map to start there.
3. **Choose how much guidance.** *Light* (about every 5 minutes), *Standard* (about every 3) or *Hands-on* (about once a minute), or switch the guide off for plain subtitles.
4. **Listen.** Subtitles follow the host line by line. At a natural pause, the episode fades out, Mia or Leo says their piece in your language (target-language words said with a native accent), then the episode fades back in from just before where it stopped.
5. **Wrap up.** A few questions, the words you kept, a line you caught to share, and a goodbye from your guide in the language you're learning.

## Features

- **Real podcasts, streamed from the publisher.** Episode audio is never re-hosted, so creators keep their listeners.
- **Dual-language subtitles.** Tap any word for what it means in that sentence.
- **A spoken guide that waits its turn.** Moments land only where a speaker has finished an answer or asked a question, never mid-sentence.
- **Host clips.** Words are taught in the host's own voice, in context, then repeated slowly by the guide.
- **Words tab.** Save words with the clip they came from and review them later.
- **Primer and episode map** for every prepared episode.
- **Works with your phone in your pocket.** Background play, lock screen and headphone controls; pause stops the guide mid-sentence too.
- **Offline listening.** A prepared episode downloads with its lesson and guide audio, plays without a signal, and can be removed and downloaded again.
- **Adverts handled.** Polycast lines each lesson up with *your* copy of the episode, even when the host stitches in different adverts for your country. Advert breaks show on the scrubber and Mia waits them out (you can still skip).
- **Translated show pages.** Show and episode titles and descriptions, with the translation one tap away.
- **New-episode nudges** for shows you've finished, at most one a week.

## Plans

| | What you get |
|---|---|
| **Free** | Every ready episode with subtitles, and the guide on one episode a week |
| **Plus** · €4.99 a month or €39 a year | The guide on everything, and up to 5 hours of new episodes prepared each month |
| **Your own API keys** | Optional: add your own ElevenLabs and Google Gemini keys (with a step-by-step set-up guide in the app) and prepare episodes on your own accounts. Keys stay in the iPhone Keychain |

Every episode anyone prepares joins the shared library, so the free catalogue grows as people learn.

---

## How it works

Each episode is prepared **once**, on the server, and shared by everyone learning it. Nothing is generated while you listen.

1. **Transcribe**: ElevenLabs Scribe, with word timings, told the show's and hosts' names so it spells them right. A publisher's own word-timed transcript is used instead when the feed has one.
2. **Translate and gloss**: Gemini translates every line and prepares a glossary so tap-a-word is instant.
3. **Plan the lesson**: Gemini drafts the guide's moments, primer, sections and wrap-up against subtitle lines. Polycast's own code then places every moment on a natural pause, cuts the host clips and ranks moments into the Light, Standard and Hands-on levels. The AI never picks timestamps.
4. **Voice the guide**: ElevenLabs Eleven v4 Turbo (Mia is *Bella*, Leo is *Charlie*), with target-language words pronounced natively inside English lines.
5. **Fingerprint**: a compact loudness fingerprint of the copy we transcribed is stored (never the audio). On the phone, the app fingerprints the learner's own download and moves every time in the lesson onto it, so subtitles, clips and moments stay in sync around different adverts.

Costs are tracked in a ledger, every AI call is counted against an allowance, and a daily spending cap stops anything runaway. AI keys never ship in the app.

## Tech stack

| Layer | Technology |
|---|---|
| iPhone app | Expo (React Native), Expo Router, TypeScript |
| Audio | react-native-track-player (episode), expo-audio (guide) |
| Sign-in | Sign in with Apple, 6-digit email code (Supabase Auth) |
| Purchases | App Store in-app purchase via RevenueCat |
| Server | Node + Hono (API and preparation worker in one process), ffmpeg, deployed on Railway |
| Database and storage | Supabase (Postgres with row-level security, Frankfurt) |
| Transcription | ElevenLabs Scribe |
| Writing and translation | Google Gemini (batch service for Polycast's own re-preparations) |
| Guide voices | ElevenLabs Eleven v4 Turbo (Google Chirp 3 HD as fallback) |
| Podcast discovery | Podcast Index, Apple Podcasts charts and search |
| Crash reports | EAS Observe (nothing personal attached) |

## Repository layout

```
packages/core   Pure TypeScript shared by server and app: lesson plans, guide levels and spacing,
                natural pauses, host clips, allowances, costs, difficulty, audio sync, RSS parsing
server          Preparation pipeline and API
  src/pipeline    transcribe → translate → plan → voice
  src/providers   AI providers behind interfaces (mocked in tests)
  supabase/       numbered database migrations
app             The Expo iPhone app
  src/app         screens (Discover, Library, Words, You, episode, listen, onboarding, Plus, keys)
  src/player      the guided-listen engine
legacy-web      The May 2026 web prototype, kept for reference only
docs            Build plan, decisions log, App Store listing draft
```

## Run it locally

```bash
pnpm install
pnpm check            # typecheck and test every package
```

- **Server tests against a real database:** `source scripts/test-db.sh` first, otherwise those tests are skipped.
- **The app on an iPhone or simulator:** `pnpm --filter @polycast/app ios` (needs Xcode), or see `scripts/mac-iphone.sh` and `scripts/mac-simulator.sh`.
- **A browser preview with sample data** (a fictional Swedish show and pretend audio, no iPhone needed):

  ```bash
  cd app && EXPO_PUBLIC_DEMO=1 npx expo export --platform web
  ```

- **Prepare an episode by hand:** `pnpm --filter @polycast/server prepare-episode` (needs provider keys in your environment).

## Docs

- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md): milestones and what's left before launch
- [`docs/DECISIONS.md`](docs/DECISIONS.md): every product and technical decision, newest first, with the reasoning
- [`docs/APP_STORE.md`](docs/APP_STORE.md): App Store listing draft and review notes

---

Made by [Finlay Panting](https://github.com/FinlayPanting) in Salzburg, vibe coded with Claude Code.

## Licence

MIT
