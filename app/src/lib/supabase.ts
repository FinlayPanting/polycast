import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import { config } from './config'

/** Signed-in learners read the catalogue and their own rows directly; row-level security keeps the rest out. */
export const supabase = createClient(config.supabaseUrl || 'https://placeholder.supabase.co', config.supabaseAnonKey || 'placeholder', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
})

// Refresh the session only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
