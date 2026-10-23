// CarPlay (PC-1022-10): asks for the CarPlay audio entitlement Apple grants to Polycast's team,
// and declares the car's scene (modules/polycast-carplay). A scene manifest makes the phone run as
// a scene too, so the phone's scene hands over the window Expo's AppDelegate builds, unchanged.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins')

function withCarPlay(config) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.carplay-audio'] = true
    return c
  })
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Phone', UISceneDelegateClassName: 'PolycastPhoneSceneDelegate' },
        ],
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneClassName: 'CPTemplateApplicationScene',
            UISceneConfigurationName: 'CarPlay',
            UISceneDelegateClassName: 'PolycastCarPlaySceneDelegate',
          },
        ],
      },
    }
    return c
  })
}

module.exports = withCarPlay
