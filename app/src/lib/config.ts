/** Public configuration, compiled into the app from EXPO_PUBLIC_* variables (see .env.example). */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  /** Sample data and pretend audio, for previews and screenshots. Never set in a store build. */
  demo: process.env.EXPO_PUBLIC_DEMO === '1',
  demoSignedOut: process.env.EXPO_PUBLIC_DEMO_SIGNED_OUT === '1',
}

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
