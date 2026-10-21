# App Store listing (draft)

The text for Polycast's App Store page. Keep the real-host line word for word: the app shows the same line on its welcome screen (`app/src/lib/copy.ts`), and a test checks they match.

## Subtitle (30 characters)

Learn languages with podcasts

## Description

Learn a language through the podcasts people there actually listen to.

Polycast puts subtitles on real podcasts in Spanish, French, German, Italian, Portuguese and Swedish, with your own language underneath, like watching a foreign film. Your guide, Mia or Leo, steps in at natural pauses: a word to listen for, a quick recap of what you might have missed, a phrase replayed in the host's own voice.

The host is real. Mia and Leo only step in when the host pauses.

- Any show with a public feed, plus hand-picked starter shows for each language
- Tap any word for what it means in that sentence, and save it with the clip it came from
- Choose Light, Standard or Hands-on guidance, or switch the guide off for plain subtitles
- Works with your phone in your pocket, through headphones
- Every episode streams from the show's own feed, so creators keep their listeners

Free: every ready episode with subtitles and the guide on one episode a week. Plus: the guide on everything and up to 5 hours of new episodes a month, €4.99 a month or €49 a year.

## Privacy label: crash data (17 Oct 2026)

The app sends crash reports and start-up timings through EAS Observe (PC-1015-10). In App Store Connect's App Privacy answers, declare **Diagnostics → Crash Data** and **Performance Data**: used for App Functionality, **not linked** to the user, **not used for tracking**. No account id, email or listening data is attached.

## Notes for App Review: your own API keys (PC-1017-K1)

Paste into App Review Information → Notes when "Use your own API keys" ships:

"Polycast Plus is sold only through in-app purchase. Separately, and entirely optional, a learner who already has their own ElevenLabs and Google Gemini API keys can enter them in Settings so that episodes they prepare run on their own accounts with those providers. No purchase is made or unlocked this way, no digital content is sold outside the App Store, and the app works fully without keys. Keys are stored in the iOS Keychain and sent only to our server over HTTPS while that episode is prepared."

## In-app purchases (19 Oct 2026)

| Product | Type | Product ID | Price |
| --- | --- | --- | --- |
| Plus monthly | Auto-renewable, group "Polycast Plus" | com.finlaypanting.polycast.plus.monthly | €4.99 |
| Plus yearly | Auto-renewable, group "Polycast Plus" | com.finlaypanting.polycast.plus.annual | €49.00 |
| Small tip | Consumable | com.finlaypanting.polycast.tip.small | €1.99 |
| Medium tip | Consumable | com.finlaypanting.polycast.tip.medium | €4.99 |
| Large tip | Consumable | com.finlaypanting.polycast.tip.large | €9.99 |

In RevenueCat: entitlement `plus` on the two Plus products only; offering `default` with Monthly and Annual packages. The tips need no entitlement or offering: the app asks for them by product id. Review note for each tip: "A one-off tip on the Support Polycast screen (You → Leave a tip). It unlocks nothing."

## App Review sign-in (PC-1012-04, 19 Oct 2026)

Reviewers can't receive an emailed code, so `review@polycast.app` signs in with a password instead (`app/src/lib/reviewAccount.ts`); every other address still gets a code. To set it up once:

1. Supabase → Authentication → Users → Add user → Create new user: `review@polycast.app`, a strong generated password, "Auto Confirm User" ticked.
2. Sign in once on your iPhone with it and finish onboarding (Swedish, guide on), so the reviewer lands on a working Discover.
3. App Store Connect → the version → App Review Information → Sign-in required: user name `review@polycast.app`, the password. Keep the password only there and in your password manager.

## Notes for App Review: every feature, and how Mia is kept safe (PC-1018-05, 21 Oct 2026)

Apple's 16 Oct 2026 guideline update added 2.5.19 (no hidden, dormant or undocumented features) and named missing safeguards under 1.2. Paste this into App Review Information → Notes, below the own-keys note above. Keep it in step with the app: if a card adds something a reviewer could stumble on, add a line here in the same commit.

"Polycast puts subtitles and a spoken guide on real, public podcasts. Everything in the app is reachable from its four tabs; there are no hidden screens, test switches or features that turn on later.

What you might come across:
• Sign-in: use the demo account in Sign-in Information (password sign-in for that address only; everyone else gets an emailed code).
• Discover → 'Tell Mia what you're in the mood for': type a mood and Mia suggests three shows or episodes from Polycast's catalogue, each with a one-line reason. Free accounts get three a day.
• Listening: subtitles in the language being learned with English underneath. The guide (Mia or Leo) speaks only while the host is paused, from a lesson written once when the episode was prepared; nothing is generated while you listen. Free accounts hear the guide on one episode a week; subtitles are always free.
• Tap any word for its meaning in that sentence and save it to Words, with the clip it came from.
• An episode's page → 'Download for offline'. The copy stays on the phone and can be removed there or under You → Downloads; Polycast's servers never store or re-host episode audio, which always comes from the show's own feed.
• You → your own API keys (optional, see the note above; also offered on the Plus screen), 'Leave a tip' (consumable, unlocks nothing), Plus (in-app purchase only), 'For podcast creators', and Delete account.

How Mia is kept safe:
• Every line the learner hears from a show is the host's own audio from that show's public feed. Mia and Leo never imitate or speak as the host, and their voices are clearly a separate guide.
• The guide explains, translates and recaps what was actually said. It never invents things the host said; recaps and word notes are written from the episode's transcript.
• The guide's lines are written once per episode, when it is prepared; nothing is generated live during a listen, and there is no open chat with the guide.
• Creators can ask for their show to be removed at polycast.app/creators (also linked in the app under You → For podcast creators); a removed show can no longer be opened or played in Polycast.
• Every AI request goes through Polycast's server, counts against the learner's allowance and a daily spending cap, and no AI keys are built into the app."

Before each submission, `app/src/lib/releaseBuild.test.ts` confirms the store build can't reach demo mode or test-only tools: the production build profile and the update workflow never set `EXPO_PUBLIC_DEMO`, and the playback-log button only appears in the personal-team test build.
