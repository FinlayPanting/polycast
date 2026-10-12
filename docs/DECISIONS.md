# Decisions the spec left open

Newest first. Each line: date, decision, why. Finlay can overrule any of these.

- 2026-10-12: Tap-a-word meanings are prepared with the episode as a glossary (one AI pass over every distinct word, about $0.06 an hour), because nothing may be generated during a listen. New-audio cost is now about $0.57 an hour; the worst-case 2-hour free episode about $1.14, so 100 free episodes cost at most about $115.
- 2026-10-12: Sign-in at launch: Sign in with Apple and a 6-digit email code. Google sign-in is left out; it would also oblige Apple sign-in anyway, and adds a setup step for little gain on iPhone.
- 2026-10-12: Episode audio plays through react-native-track-player (background play, lock screen, headphone presses as events); guide speech through expo-audio. Both sit behind small interfaces in app/src/player, so either can be swapped if device testing shows a problem.
- 2026-10-12: The guide speaks over a paused episode (faded out, then paused), never over the host. Host clips play from the episode itself, then it seeks back to exactly where it paused.

- 2026-10-12: The server is one Node process (API + worker) on a small host, because guide audio needs ffmpeg, which Supabase Edge Functions can't run. Supabase provides the database, sign-in and file storage.
- 2026-10-12: Failed jobs retry up to 3 times; after that the learner gets their free episode or Plus hours back. Hitting the daily cap fails the job without retrying, and also refunds.
- 2026-10-12: Alerts for Finlay (50/90/100 free episodes, spending cap, removal requests) go to a webhook such as a private ntfy.sh topic, so they reach his phone with no extra account.

- 2026-10-12: Learner-requested episodes use Gemini at the standard rate, not batch: batch targets up to 24 hours, breaking "ready in under 5 minutes". Batch is fine for pre-preparing the starter shelf. Cost per hour of new audio is about $0.51 (2-hour free episode about $1.01).
- 2026-10-12: Each episode is voiced once for the guide of whoever first prepares it. A learner who picks a different guide triggers a voice-only pass (about $0.20 an hour), charged to the service rather than their allowance, and cached for everyone after. It still counts against the daily spending cap.
- 2026-10-12: Starting voices: Mia = Gemini "Sulafat" (warm), Leo = Gemini "Achird" (friendly). For Finlay to audition and change in server/src/voices.ts.
- 2026-10-12: A publisher's own transcript replaces transcription only when it is word-timed JSON (Podcasting 2.0). Sentence-level VTT/SRT can't give accurate host clips, so those episodes are transcribed.
- 2026-10-12: Plus's 5-hour allowance resets on the subscription's renewal date each month (to be wired to App Store renewal events); until then, calendar month in UTC.
- 2026-10-12: Lesson plans: the AI drafts content against subtitle-line ids; Polycast's own code places every moment on a natural break, cuts the host clips, sets levels by spacing, and drops anything it can't place. The AI never chooses timestamps.
- 2026-10-12: May's web app moved to `legacy-web/` on the `rebuild-ios` branch; `main` and the live Vercel site are untouched until launch.
- 2026-10-12: Open spec decisions defaulted while building: creators can ask for removal (no opt-in programme at launch); design direction as written in the spec; keep the name Polycast.
