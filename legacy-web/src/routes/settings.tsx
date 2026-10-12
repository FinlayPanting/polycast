import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getApiKeys, saveApiKeys, getPreferences, savePreferences, type ApiKeys, type Preferences } from '../lib/storage'

export const Route = createFileRoute('/settings')({
  validateSearch: (s: Record<string, unknown>) => ({ missing: Boolean(s.missing) }),
  component: SettingsScreen,
})

const MIN_OPTIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
]

const MAX_OPTIONS = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
]

function SettingsScreen() {
  const { missing } = useSearch({ from: '/settings' })
  const [keys, setKeys] = useState<ApiKeys>({ openai: '', elevenlabs: '' })
  const [prefs, setPrefs] = useState<Preferences>({ summaryMin: 60, summaryMax: 120, defaultLanguage: 'Swedish' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setKeys(getApiKeys())
    setPrefs(getPreferences())
  }, [])

  function handleSave() {
    saveApiKeys(keys)
    savePreferences(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col px-5 pb-8 gap-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Keys are stored locally on your device only.</p>
      </div>

      {missing && (
        <div className="bg-brand/10 border border-brand/30 rounded-xl px-4 py-3">
          <p className="text-brand text-sm font-medium">API keys required</p>
          <p className="text-brand/70 text-xs mt-0.5">Add your OpenAI and ElevenLabs keys below to generate summaries.</p>
        </div>
      )}

      <Section title="API Keys">
        <KeyField
          label="OpenAI API Key"
          placeholder="sk-…"
          value={keys.openai}
          onChange={(v) => setKeys({ ...keys, openai: v })}
          hint="Used for Whisper transcription and GPT-4o summaries"
        />
        <KeyField
          label="ElevenLabs API Key"
          placeholder="Your ElevenLabs key"
          value={keys.elevenlabs}
          onChange={(v) => setKeys({ ...keys, elevenlabs: v })}
          hint="Used to synthesise summary voiceovers (Rachel voice)"
        />
      </Section>

      <Section title="Summary Frequency">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Minimum gap</label>
            <div className="grid grid-cols-4 gap-2">
              {MIN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPrefs({ ...prefs, summaryMin: opt.value, summaryMax: Math.max(prefs.summaryMax, opt.value + 30) })}
                  className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                    prefs.summaryMin === opt.value
                      ? 'bg-brand/15 border-brand text-brand'
                      : 'bg-white/4 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Maximum gap</label>
            <div className="grid grid-cols-4 gap-2">
              {MAX_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  disabled={opt.value <= prefs.summaryMin}
                  onClick={() => setPrefs({ ...prefs, summaryMax: opt.value })}
                  className={`py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    prefs.summaryMax === opt.value
                      ? 'bg-brand/15 border-brand text-brand'
                      : 'bg-white/4 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-600">Summaries land at natural sentence pauses within this window.</p>
        </div>
      </Section>

      <button
        onClick={handleSave}
        className="w-full py-3.5 bg-brand text-black font-semibold rounded-xl transition-all active:scale-[0.98]"
      >
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

function KeyField({
  label, placeholder, value, onChange, hint,
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand/50 transition-colors font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && <p className="text-xs text-zinc-600 mt-1.5">{hint}</p>}
    </div>
  )
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
  )
}
