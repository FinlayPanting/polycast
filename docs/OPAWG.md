# Polycast on the OPAWG user-agent list (PC-1019-04)

Podcast hosts and OP3 recognise apps from the open OPAWG list
(https://github.com/opawg/user-agents-v2, file `src/apps.json`). Polycast names itself on every
episode request as `Polycast/1.0 (+https://polycast.app)`: the app's downloads, streams and word
clips (`app/src/lib/userAgent.ts`) and the server's feed and audio reads (`server/src/safeFetch.ts`).

The one entry to add to `src/apps.json` (keep the file's alphabetical order), with a pull request
titled "Add Polycast":

```json
{
  "user_agents": ["^Polycast/"],
  "app": "Polycast",
  "info_url": "https://polycast.app",
  "examples": ["Polycast/1.0 (+https://polycast.app)"],
  "os": "ios",
  "device": "phone"
}
```

Once merged, OP3 and hosts that use the list file Polycast listens under "Polycast" rather than
"Unknown players".
