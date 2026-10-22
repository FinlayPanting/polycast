/**
 * The lock-screen transcript test (PC-1020-L1): a widget extension holding only the Live
 * Activity. Built by @bacons/apple-targets during prebuild; its bundle id is the app's plus
 * ".liveline", which needs its own provisioning profile on the paid Apple team.
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'LiveLine',
  displayName: 'Polycast',
  bundleIdentifier: '.liveline',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
}
