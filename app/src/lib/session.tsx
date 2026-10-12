import type { Session } from '@supabase/supabase-js'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export interface Profile {
  id: string
  signup_rank: number
  native_language: string
  target_language: string | null
  guidance_level: 'light' | 'standard' | 'handsOn'
  guide_id: string
  flag_id: string
  subtitle_mode: 'target' | 'both' | 'none'
  plan: 'free' | 'plus'
  free_episode_used: boolean
  plus_used_sec: number
}

/** The preferences a learner may change themselves; everything else is set by the server. */
export type ProfilePrefs = Partial<Pick<Profile, 'native_language' | 'target_language' | 'guidance_level' | 'guide_id' | 'flag_id' | 'subtitle_mode'>>

interface SessionValue {
  ready: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  updatePrefs: (prefs: ProfilePrefs) => Promise<void>
  signInWithApple: () => Promise<void>
  sendEmailCode: (email: string) => Promise<void>
  verifyEmailCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void loadProfile(s)
    })
    return () => data.subscription.unsubscribe()
  }, [loadProfile])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      profile,
      refreshProfile: () => loadProfile(session),
      async updatePrefs(prefs) {
        if (!session) return
        setProfile((p) => (p ? { ...p, ...prefs } : p)) // feels instant; the server copy follows
        const { error } = await supabase.from('profiles').update(prefs).eq('id', session.user.id)
        if (error) {
          await loadProfile(session)
          throw new Error('Couldn’t save that change. Check your connection and try again.')
        }
      },
      async signInWithApple() {
        // A hashed nonce goes to Apple; the raw one to Supabase, which checks they match.
        const raw = Crypto.randomUUID()
        const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce: hashed,
        })
        if (!credential.identityToken) throw new Error('Apple didn’t return a sign-in. Please try again.')
        const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: raw })
        if (error) throw new Error('Sign-in didn’t work. Please try again.')
      },
      async sendEmailCode(email) {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
        if (error) throw new Error('We couldn’t send a code to that address. Check it and try again.')
      },
      async verifyEmailCode(email, code) {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (error) throw new Error('That code didn’t work. Check it, or send a new one.')
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [ready, session, profile, loadProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}
