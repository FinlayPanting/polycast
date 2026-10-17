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

## A calmer guide (14 Oct 2026, live)

Finlay, after a 15-minute test on his iPhone: the guide cut in, said its piece and was gone before he'd taken it in, and host clips ran straight into its words. Changes:
- Handovers: the host fades out over 450 ms (eased), a 450 ms breath, the guide; a 500 ms breath after, then the episode fades back in over 900 ms from 2 seconds before where it stopped, so the learner hears the end of the sentence again. Pauses inside a moment: 350 ms before a host clip, 450 ms after, 120 ms between guide lines. Host clips start 0.15 s early and end 0.2 s late so names aren't clipped.
- Scripts (lesson plan version 3, which re-plans and re-voices every ready episode once at Polycast's cost): context first (who's talking, about what), a lead-in before each host clip, and every term heard twice, from the host and then slowly from the guide. Quick questions start with a line of context.
- Voice: the guide's own language at 0.9 speed (was 0.95), target-language words and examples at 0.8.
- The app saves every guide line to the phone with the episode, so the guide starts at once (fetching each line as it played took about a second, up to 14 seconds with the phone locked) and works offline.
- Replaying a line or going back under a minute no longer makes the guide repeat a moment just heard; moments skipped by seeking forward still come back.
- A Hands-on question asked while the phone is locked is read out, then the episode carries on after a 3-second pause instead of waiting for a tap that can't come.

## Episodes saved for offline (14 Oct 2026, live)

Finlay: once an episode is set up it should play without internet, be removable and re-downloadable, and preparing it should download everything, guide included. When a learner's own preparation finishes, the episode page saves the whole thing to the phone: their copy of the audio, the lesson lined up with it, and every guide line. Episodes others prepared get a "Download for offline" button; saved ones show "Saved on this phone" and "Remove download". Offline, the player, the episode page, the Library and the resume position all fall back to what's on the phone. Saving uses a new `POST /v1/episodes/:id/lesson`, which returns the same as `/listen` (with the same guide entitlement) but records nothing, so downloading ahead doesn't use a free learner's weekly guided episode or count in the funnel. A listen started offline isn't recorded on the server.

## Mia says hello after you pick a language (15 Oct 2026)

Board item PC-1013-01, as Finlay decided on 14 Oct: no host audio. Once a learner has picked the language they're learning, the next screen ("What do you enjoy?") plays a short welcome from Mia in their own language (English for now): what Polycast does, that the hosts do the talking and she steps in at pauses, and one or two words in the target language (¿qué tal?, on y va, genau, allora, tudo bem?, fika), read by the same voice in that language at the slower target pace. The script is shown under "Mia says hello" with the target words in italics, with Stop and Play again.
- Voiced ahead of time, never while anyone listens: on start-up the worker voices any language whose welcome isn't stored yet (`server/src/welcome.ts`), counted against the daily spending cap (ledger id `welcome-v1-en-<lang>-mia`, about a cent each), and stores the parts and a small manifest in the public guide-audio bucket at `welcome/v1/en-<lang>/mia.json`. The app reads that file directly. Changing a script means bumping `WELCOME_VERSION` on both sides.
- Simplest options picked where the decision was silent: Mia only (the guide is chosen later in set-up), played on the interests screen because the language is chosen just before it, and the card stays hidden if the welcome can't be loaded, so set-up never waits on it. Stored on the server rather than bundled in the app, because voicing needs the server's keys; it is still fixed audio.

## Prices that change on 1 Jan 2027, and a cheaper-voice audition (15 Oct 2026)

Board item PC-1013-03. Google doubles its Gemini 3.8 prices on 1 Jan 2027 (pricing page checked 15 Oct 2026): Flash text $0.75/$3.75 → $1.50/$7.50 per million tokens in/out, Flash TTS $9 → $18 and Flash-Lite TTS $6 → $12 per million audio tokens. `@polycast/core` cost.ts now has `PRICES_2026` and `PRICES_2027`, and `costUSD` and the preparation estimate use whichever is in force at that moment (midnight UTC), so the spend ledger, the daily cap and the up-front reservation stay honest without a deploy on New Year's Day. Scribe and Chirp 3 HD prices don't change. Today's guide voice is Chirp 3 HD, so the 2027 effect on an hour of new audio is only the text model: about $0.15 more (about $0.84 → $0.99). The cap itself and the free-episode rules are unchanged.

`pnpm --filter @polycast/server audition-voices` (needs `GEMINI_API_KEY`) voices the same three Mia and Leo lines on Flash TTS and Flash-Lite TTS into `./audition`, with each line's two takes side by side, and prints the cost of an hour of guide speech on each now and in 2027. It stops at `DAILY_CAP_USD` (default $0.50; one run costs well under a cent). Note that Gemini TTS is now only the fallback when `GOOGLE_TTS_API_KEY` isn't set, so this mainly matters if Finlay wants to move back from Chirp.

## Show feeds are fetched safely (15 Oct 2026)

Board item PC-1013-04. A show's feed address comes from the app, and a feed can name a transcript address, so the server now fetches both through `server/src/safeFetch.ts`: http(s) only, no logins in the address, the host must resolve only to public internet addresses (private, loopback, link-local and cloud-metadata ranges, carrier-grade NAT, `localhost`, `*.internal` such as Railway's private network, and IPv6 unique-local are refused), every redirect is checked the same way (at most 5), 15 seconds for the whole fetch and at most 20 MB. A refused or failed feed gives the learner the usual "We couldn't load this show right now." Known gap: a host could change its DNS answer between our check and the fetch (DNS rebinding); the time and size limits still apply. The Top charts language check, which only reads the first 64 KB of feeds Apple lists and already had a time limit, is unchanged.

## Spam guard on the removal form (16 Oct 2026)

Board item PC-1013-05. `POST /removal-requests` is public and every request alerts Finlay, so the server now takes only text fields, trimmed, with the show's name and contact up to 200 characters and the message up to 2,000, and allows 5 requests per address per hour plus 30 an hour overall, after which it answers 429 "Please try again in an hour." Limits live in memory (`server/src/rateLimit.ts`), which is fine for one Railway process; a restart forgets them. The address is Railway's `X-Real-IP`, else the last `X-Forwarded-For` entry, because earlier entries can be made up by the caller. Still to do, needing Finlay: migration `0005` (on branch `build/PC-1013-05`) stops anonymous visitors inserting into `removal_requests` directly through Supabase.

## Real host, real show (16 Oct 2026)

Board item PC-1013-06. The welcome screen (the first thing a new learner sees) now carries, under the tagline, "The host is real. Mia and Leo only step in when the host pauses." The same line opens the guide paragraph of a first draft App Store description in `docs/APP_STORE.md`; it lives in `app/src/lib/copy.ts` and a test keeps the two identical. Simplest placement picked: one quiet line on the welcome screen rather than a new onboarding step.

## RevenueCat repeats can't reset Plus hours (16 Oct 2026)

Board item PC-1013-10. RevenueCat may deliver the same event more than once. A purchase or renewal now starts a new Plus period (fresh 5 hours) only if its `purchased_at_ms` is later than the current period's start, and the period start is set from that purchase time rather than the moment the message arrived. An event without a purchase time only resets a period that started 27 or more days ago. No new table was needed, so there's no migration; the allowance itself is unchanged.

## 'No. 1 in Germany' on the Top charts shelf (16 Oct 2026)

Board item PC-1014-07. Shows on the Top charts shelf carry a small tag with their place in the country's Apple Podcasts top 50 (the chart the shelf is built from, per the spec), e.g. "No. 1 in Germany"; Spanish and Portuguese shows name Spain, Mexico, Portugal or Brazil, whichever chart they came from. The place is the show's rank in the full country chart, before Polycast drops shows in other languages, so it matches what people there see. The board's evidence quoted Spotify's chart; Polycast reads Apple's, so the numbers can differ from Spotify's. The chart cache key changed to `top:in-language:ranked`, so the first Discover load per language after this deploy re-reads Apple's chart.

## Gentle Plus card after the free episode (16 Oct 2026)

Board item PC-1013-09, as the spec says ("the wrap-up at its end is where the gentle invitation to Plus appears"). `/listen` and `/lesson` now return `freeEpisode`: true when a learner on the free plan is listening to the episode their own free episode prepared. Its wrap-up then shows, above Done, a quiet card: "You listened for 42 minutes and kept 6 words." and a "Keep going with Plus: 5 hours a month" button that opens the Plus screen. Minutes are where the listen ended (capped at the episode's length); words are those kept during this listen. No price, countdown or reminder; it never shows again for that learner once they have Plus.

## Episode downloads stop piling up in iCloud (16 Oct 2026)

Board item PC-1014-02. The downloads folder (Documents/episodes) is now marked as excluded from iCloud backup whenever it's used, through a new `excludeFromBackup` function in the app's own native module (so it takes effect from the next TestFlight build; older builds skip it). On each launch, once the learner's saved words can be read, downloads whose files were all last touched over 30 days ago are removed, except episodes a saved word comes from and any download in progress; offline, nothing is removed. The You tab has a Downloads section with the space used and a "Clear downloads" button (with a confirmation). In review on an iPhone, a word whose episode copy has gone shows "Its episode is no longer on this phone, so the host's clip can't play. Download the episode again to hear it." instead of playing a fresh stream, which may carry different adverts and so the wrong moment. Simplest options picked: "last touched" is the newest file time for that episode (playing it updates its saved position), and Clear downloads removes everything, words' episodes included, since the learner asked.

## Advert breaks on the scrubber; Mia waits them out (16 Oct 2026)

Board item PC-1014-04, with Finlay's note: highlight the adverts and the spots Mia waits out, but learners can still skip through adverts, as in any podcast app. After lining the lesson up with the learner's own copy, the app treats each stretch of 15 seconds or more that only their copy has (`listenerOnlyStretches` in `@polycast/core` sync.ts; usually adverts stitched in for them) as an advert break. Breaks show as a soft band on the scrubber and, while one plays, a quiet "Advert break" line with "Mia waits it out. The lesson picks up after, in 0:42." and a "Skip to the end of the advert" button; dragging through still works. Nothing skips by itself. Guide moments never land inside these stretches already, because the lesson only uses shared moments. Breaks are saved with the episode, so they show offline too. Adverts that are also in the copy we transcribed can't be told apart from the show, so they aren't marked. Display only, no AI cost.

## New-episode nudges (16 Oct 2026; migration 0006 applied by Finlay)

Board item PC-1013-08. Every 3 hours the server re-reads the feeds of shows a learner finished in the last 60 days, then sends each learner who has notifications on at most one push a week: "New <show> is out. Get it ready?", for the newest episode published in the last week, after they finished that show and after their last nudge, that they haven't started. Simplest options picked: only between 09:00 and 19:00 UTC (daytime across Europe); the learner's last nudge is a single new `profiles.last_nudged_at` column (migration `0006_new_episode_nudges.sql`), marked before sending so a failed push can't lead to two; no separate on/off setting beyond iOS's own notification switch. Tapping any Polycast notification (this or "your episode is ready") now opens that episode's page.

## Share a line you caught (17 Oct 2026)

Board item PC-1014-06. The wrap-up now offers "Share a line you caught": up to three of the host's lines around words the learner saved or the guide taught in this listen (lines with a translation, 12 to 160 characters), shown as a card with the show's artwork, the line, its meaning and "Caught on Polycast, from <show>". "Share this line" opens the iPhone share sheet with the same words and a link. Simplest options picked: the share sheet carries text and the link rather than an image of the card, because turning a card into a picture needs a new native module (react-native-view-shot) that couldn't be checked on a device from the build run; it's an easy follow-up once TestFlight builds are flowing. The link is https://polycast.app (`SHARE_URL` in `app/src/lib/shareLine.ts`), which should forward to the App Store page once the app has its listing; swap it for the App Store link then if the site isn't up. If nothing was caught, the section doesn't show.

## 'Good first listen' on a show page (17 Oct 2026)

Board item PC-1014-10. On a show's page, one of the latest five episodes gets a "Good first listen" tag (`goodFirstListen` in `@polycast/core`): first preference is one that fits in a sitting (30 minutes or less), then the easiest by its difficulty estimate (an episode not prepared yet, so with no estimate, counts between moderate and challenging), then the shorter, then the newer. Simplest options picked: it's shown to everyone, not only learners who haven't listened yet, and nothing is tagged when a show lists fewer than two episodes. Computed on the phone from the listing the server already sends; no AI cost.
