// Builds normally from app.json. With POLYCAST_PERSONAL_TEAM=1 (scripts/mac-iphone.sh) it
// makes a test build a free Apple account can sign: its own bundle id, so the real one stays
// free for the paid team, and without Sign in with Apple and push notifications, which free
// accounts can't use. Learners never get this build.
const { withEntitlementsPlist } = require('expo/config-plugins')

module.exports = ({ config }) => {
  if (process.env.POLYCAST_PERSONAL_TEAM !== '1') return config
  const pluginName = (p) => (Array.isArray(p) ? p[0] : p)
  const personal = {
    ...config,
    name: 'Polycast Test',
    // Shows "Share playback log" on the You tab, for testing on a phone.
    extra: { ...config.extra, testBuild: true },
    ios: {
      ...config.ios,
      // One id per Apple team: an id registered by one team can't be used by another, so a Mac
      // with two teams in Xcode would otherwise fail ("cannot be registered to your development team").
      bundleIdentifier: `${config.ios.bundleIdentifier}.test${process.env.POLYCAST_TEAM ? `.t${process.env.POLYCAST_TEAM.toLowerCase()}` : ''}`,
      usesAppleSignIn: false,
      infoPlist: { ...config.ios.infoPlist, UIBackgroundModes: ['audio'] },
    },
    plugins: config.plugins.filter((p) => !['expo-apple-authentication', 'expo-notifications'].includes(pluginName(p))),
  }
  // Some packages add these on their own; a free account can't sign an app that asks for them.
  return withEntitlementsPlist(personal, (c) => {
    delete c.modResults['aps-environment']
    delete c.modResults['com.apple.developer.applesignin']
    return c
  })
}
