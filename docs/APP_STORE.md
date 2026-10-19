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
