import type { ObserveConfig } from 'expo-observe'

/**
 * Crash reports and start-up timings through EAS Observe (board item PC-1015-10): where Polycast
 * crashed, on which iPhone and app version. Nothing about the learner is attached: no account id,
 * email, episode or words, only what Observe gathers about the app and device. Debug builds on
 * Finlay's own phone don't send anything. Reports appear once the app is linked to its EAS project
 * (the projectId `eas init` adds); until then nothing is sent.
 */
export function observeConfig(opts: { testBuild?: boolean } = {}): ObserveConfig {
  return {
    environment: opts.testBuild ? 'test' : process.env.NODE_ENV === 'production' ? 'production' : 'development',
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  }
}
