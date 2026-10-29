import type { Session } from '@supabase/supabase-js'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { config } from './config'
import { PENDING_PLUS_MS, waitForServerPlus, withPendingPlus } from './plusPending'
import { supabase } from './supabase'
import { DEMO_NEW_PROFILE, DEMO_PROFILE, DEMO_SESSION } from '../demo/session'

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
  interests: string[]
}

/** The preferences a learner may change themselves; everything else is set by the server. */
export type ProfilePrefs = Partial<Pick<Profile, 'native_language' | 'target_language' | 'guidance_level' | 'guide_id' | 'flag_id' | 'subtitle_mode' | 'interests'>>

interface SessionValue {
  ready: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  /** The App Store has just confirmed Plus: show it now and keep checking until the server agrees. */
  confirmPlus: () => void
  updatePrefs: (prefs: ProfilePrefs) => Promise<void>
  signInWithApple: () => Promise<void>
  sendEmailCode: (email: string) => Promise<void>
  verifyEmailCode: (email: string, code: string) => Promise<void>
  /** App Review's account only (PC-1012-04); learners sign in with a code or Apple. */
  signInWithPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [pendingPlusUntil, setPendingPlusUntil] = useState<number>()

  const loadProfile = useCallback(async (s: Session | null): Promise<Profile | null> => {
    if (!s) {
      setProfile(null)
      return null
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
    return (data as Profile | null) ?? null
  }, [])

  useEffect(() => {
    if (config.demo) {
      if (!config.demoSignedOut) {
        setSession(DEMO_SESSION)
        setProfile(DEMO_PROFILE)
      }
      setReady(true)
      return
    }
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
      profile: withPendingPlus(profile, pendingPlusUntil),
      refreshProfile: async () => void (await loadProfile(session)),
      confirmPlus() {
        setPendingPlusUntil(Date.now() + PENDING_PLUS_MS)
        if (!session) return
        void waitForServerPlus(async () => (await loadProfile(session))?.plan).then((agreed) => agreed && setPendingPlusUntil(undefined))
      },
      async updatePrefs(prefs) {
        if (config.demo) return setProfile((p) => (p ? { ...p, ...prefs } : p))
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
        // The browser preview signed out (EXPO_PUBLIC_DEMO_SIGNED_OUT): any address and code sign in as a
        // brand-new learner, so the whole first run can be walked and counted (PC-1028-07).
        if (config.demo) return
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
        if (error) throw new Error('We couldn’t send a code to that address. Check it and try again.')
      },
      async verifyEmailCode(email, code) {
        if (config.demo) {
          setSession(DEMO_SESSION)
          setProfile(DEMO_NEW_PROFILE)
          return
        }
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (error) throw new Error('That code didn’t work. Check it, or send a new one.')
      },
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error('That password didn’t work. Check it and try again.')
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [ready, session, profile, pendingPlusUntil, loadProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}
