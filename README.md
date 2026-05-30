# Polycast

**Deep immersion without losing the thread.**

Polycast is a mobile-first progressive web app for language learners who want to follow foreign-language podcasts without losing comprehension. It processes podcast episodes through an AI pipeline that inserts brief, natural-sounding English summaries at strategic pauses — so you stay immersed in the target language while still understanding what's being said.

## How it works

1. **Search** for any podcast using the iTunes directory and follow it.
2. **Open an episode** and configure the language and how often you want English summaries (e.g. every 3–7 minutes).
3. **Polycast processes the episode** through a multi-stage AI pipeline:
   - Downloads the audio
   - Transcribes it with OpenAI Whisper
   - Translates each segment with GPT-4o
   - Finds natural sentence-boundary breakpoints within your time window
   - Generates English summaries/previews with GPT-4o
   - Synthesizes summary voiceovers with ElevenLabs
4. **Listen in the player.** At each breakpoint, the episode audio fades out, a spoken English summary plays, and the episode resumes — all without losing your place. A synchronized transcript/translation view scrolls alongside playback.

## Features

- AI-powered transcription, translation, and summarization (OpenAI Whisper + GPT-4o)
- Natural-sounding English voiceovers (ElevenLabs TTS)
- Smooth audio engine: episode audio fades out/in around summaries; playback position never resets
- Dual-language transcript view with auto-scroll and tap-to-seek
- Episode processing cached to IndexedDB — no re-processing on replay
- Follow podcasts and browse episodes from any RSS feed
- PWA: installable on iOS and Android, lock screen controls via MediaSession API
- Screen stays awake during transcript reading (WakeLock API)
- Client-side only — no backend, all processing done in the browser via external APIs

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript |
| Routing | TanStack React Router (file-based) |
| Styling | Tailwind CSS 4 |
| Build | Vite 8 |
| Storage | localStorage + IndexedDB (`idb`) |
| Transcription | OpenAI Whisper |
| Translation & Summarization | OpenAI GPT-4o |
| Text-to-speech | ElevenLabs |
| Podcast search | Apple iTunes API |
| Deployment | Vercel |

## Getting started

### Prerequisites

You'll need API keys for:
- [OpenAI](https://platform.openai.com/) (Whisper + GPT-4o)
- [ElevenLabs](https://elevenlabs.io/) (text-to-speech)

### Install and run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser.

For a production build:

```bash
pnpm build
pnpm preview
```

### Configure API keys

Go to the **Settings** tab in the app and enter your OpenAI and ElevenLabs API keys. Keys are stored in `localStorage` and never sent anywhere except the respective APIs.

## Project structure

```
src/
├── lib/
│   ├── pipeline.ts       # Main orchestrator (download → transcribe → translate → summarize → TTS → cache)
│   ├── audio-engine.ts   # Dual-audio playback engine with summary injection and fading
│   ├── summarize.ts      # GPT-4o summarization, translation, breakpoint detection
│   ├── whisper.ts        # Whisper transcription with chunking for large files
│   ├── tts.ts            # ElevenLabs TTS synthesis
│   ├── rss.ts            # RSS feed fetching with CORS proxy fallbacks
│   ├── itunes.ts         # iTunes podcast search
│   └── storage.ts        # localStorage + IndexedDB abstraction
└── routes/
    ├── index.tsx          # Home: followed podcasts + search
    ├── podcast.$id.tsx    # Podcast detail and episode list
    ├── episode.$id.tsx    # Episode setup, processing, and player
    └── settings.tsx       # API key and preference configuration
```

## License

MIT
