/**
 * A word from your shows on the Home Screen (PC-1025-08): a small and a medium widget showing one
 * saved word a day, the host's line it came from and its meaning. Built by @bacons/apple-targets
 * during prebuild; its bundle id is the app's plus ".wordwidget", which needs its own App ID and
 * provisioning profile on the paid Apple team, and both share the App Group below.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'WordWidget',
  displayName: 'Polycast',
  bundleIdentifier: '.wordwidget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
