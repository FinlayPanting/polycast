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
- 2026-10-12: Name checked against rivals (PolyCast: Podcast Translator, Sep 2026; US filing POLYCAST BY UT, Mar 2026) and confirmed by Finlay: stay Polycast. Store name "Polycast: Learn with Podcasts". Domain polycast.app once it drops (about 18 Oct); getpolycast.app as fallback. Analysis in the spec's Naming tab.
- 2026-10-12: Live infrastructure: server on Railway (project "cooperative-dream", service polycast, branch rebuild-ios, auto-deploy on) at https://polycast-production.up.railway.app; database on Supabase project polycast (Frankfurt). Secrets live only in Railway variables. The app's public settings (API URL, Supabase URL, publishable key) are in app/eas.json.
- 2026-10-12: Top charts check every show's own feed and keep only those declaring the target language; a show whose feed can't be reached or declares no language is left out. Spanish merges Spain's and Mexico's charts, Portuguese Portugal's and Brazil's, alternating by rank. Search still uses one country per language.
- 2026-10-13 (branch build/PC-1012-07, not yet live): Interests are 12 tiles, up to 6 picked, some with optional chips (Sport: Football, Formula One, Tennis, Running, Golf). They map to Podcast Index categories; Formula One has no category so it uses an Apple search in the language's countries. A tile narrowed by chips uses only the chips. The "why you might like it" line is a fixed sentence per interest ("Because you follow Formula One"), so no AI cost. Discover's For you shelf comes first and alternates between interests. The onboarding step comes after choosing a language and can be skipped.

## iOS 27: scene lifecycle (13 Oct 2026)

Apps built with Xcode 27 crash at launch unless they adopt the UIScene lifecycle. Expo SDK 57 supports it as an opt-in: `expo-build-properties` with `ios.enableSceneSupport: true` (needs expo 57.0.23+). Turned on in app.json. Remove it when moving to SDK 58, which has it built in (expo/expo#46664). Any future config plugin that edits AppDelegate may clash with it.

## Guide voice: Google Cloud Chirp 3 HD (13 Oct 2026)

Finlay's call. Gemini TTS through AI Studio is capped at 10 requests a minute and 100 a day on Tier 1, and one hour-long episode needs more than 100. The server now voices the guide with Google Cloud Text-to-Speech, Chirp 3 HD, whenever `GOOGLE_TTS_API_KEY` is set (Gemini TTS stays as the fallback). Chirp 3 HD has the same voice names, so Mia is still Sulafat and Leo still Achird, in British English for English speakers. Limits are 200 requests a minute per project with no daily cap; the worker paces itself to `GOOGLE_TTS_RPM` (default 150). Price is $30 per million characters after the first million each month (free), about $0.40 for an hour-long episode against about $0.20 with Gemini, so an hour of new audio is now estimated at about $0.77 (was about $0.57). Chirp voices take no style prompt; the guide's warmth comes from the script and a speaking rate of 0.95. A daily quota (any 429 that mentions "per day") now fails the job at once with an alert, instead of retrying.

## Lessons follow each listener's adverts (13 Oct 2026)

Hosts such as Acast stitch adverts into the audio per download, by location, so the copy we transcribe and the copy a learner plays can differ, which shifted subtitles, guide moments and host clips (found by Finlay on Brief Me Baby, in Austria). Fix, agreed with Finlay: the worker downloads each episode once, uploads those exact bytes to Scribe and stores a fingerprint (the loudness of every 50 ms, about 90 KB an hour) at `guide-audio/sync/<episode>.fp`; the audio itself is held in memory only and never stored. The plan carries `syncUrl`. The app downloads the learner's copy before playing (Finlay's call: it fits a learning app and gives offline listening), fingerprints it on the phone, matches the two (`@polycast/core` sync.ts: anchors every 5 s, 10 s windows, normalised cross-correlation of the loudness rhythm) and moves every time in the lesson onto the learner's copy. Words, lines and clips that only exist in our copy (our adverts) are dropped; guide moments always survive, moved to the next shared moment. If under 60% matches, the lesson keeps its own times. Tested on the real episode with a doctored copy (pre-roll, a cut advert, an added advert, re-encoding): every shift recovered exactly, edges within about a second, 0.2 s for 73 minutes. Episodes prepared before this are prepared again once, free, by the worker on start-up. Publisher transcripts aren't fingerprinted.

## Guide speaks target-language words in a native voice (13 Oct 2026)

Finlay heard Mia read Swedish words with a British accent. The plan writer now wraps every
target-language word or sentence the guide says in `[[ ]]`; those runs are read by the same Chirp
voice (Sulafat or Achird) in the target locale, so it's the same person with a native accent. If the
target-language voice fails, the run is read in the guide's own voice rather than dropped. Brackets
never reach the screen: the guide card shows those words in italics, and questions are stored plain.

Word moments now open with what the hosts are talking about at that point, so a word is taught
inside the conversation rather than as a detour from it.

Plans carry `LESSON_PLAN_VERSION` (now 2). On start, the worker rewrites and re-voices episodes
with an older plan from their saved transcript, at Polycast's cost (about two minutes each).

The introduction can be heard again from the player ("Hear the introduction again").

## Scribe spells show and host names (14 Oct 2026, live)

Board item PC-1013-02. Every transcription sends Scribe a `transcript_edit` instruction (at most 2,000 characters) naming the show, its hosts (the feed's author, split on "och", "und", "&" and similar) and capitalised words that recur in two or more episode titles, and asks it to correct the spelling of names only. Word timings always describe Scribe's original words, so Polycast keeps those and takes an edited spelling only where the edit swaps one capitalised word for a similar-looking one (within 30% of its letters); anything added, dropped, merged or rephrased is ignored, and a failed edit leaves the original. Cost: ElevenLabs charges 30% on top of transcription for this (about $0.07 an hour, minimum 10 seconds a request), and calls the feature experimental. It is counted in the cost table and the spending cap, which puts an hour of new audio at about $0.84 (was about $0.77) and the worst-case 2-hour free episode at about $1.67.

## Weekly drop-off funnel (14 Oct 2026, live)

Board item PC-1012-09. Counts only, no tracking: the one new table, `first_opens` (migration 0004), is a daily counter the app bumps once per install with no identifier. Every other step is counted from tables Polycast already keeps, for the people who signed up in a given week: signed up, picked a language, started a guided listen, finished one, used the free episode, started Plus (has ever had a Plus period), came back (a listen updated at least 7 days after signing up). `GET /admin/funnel?week=YYYY-MM-DD` returns the counts and a plain-text version for the morning email, behind a `FUNNEL_TOKEN` Railway variable. To go live: run 0004 in Supabase, set `FUNNEL_TOKEN`, merge the branch, and give the morning email run the token.
