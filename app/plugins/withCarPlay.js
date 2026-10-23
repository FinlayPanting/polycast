// CarPlay (PC-1022-10): asks for the CarPlay audio entitlement Apple grants to Polycast's team,
// and adds the car's scene (modules/polycast-carplay) to the scene manifest that
// expo-build-properties' `enableSceneSupport` writes for the phone (EXExpoAppSceneDelegate).
// Listed before expo-build-properties in app.json on purpose: mods run in reverse order of
// registration, so this one runs after it and adds to its manifest instead of replacing it.
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins')

const CARPLAY_SCENE = {
  UISceneClassName: 'CPTemplateApplicationScene',
  UISceneConfigurationName: 'CarPlay',
  UISceneDelegateClassName: 'PolycastCarPlaySceneDelegate',
}

function addCarPlayScene(manifest) {
  if (!manifest?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication) {
    throw new Error('withCarPlay: expected the phone scene from expo-build-properties (ios.enableSceneSupport) first.')
  }
  return {
    ...manifest,
    UISceneConfigurations: { ...manifest.UISceneConfigurations, CPTemplateApplicationSceneSessionRoleApplication: [CARPLAY_SCENE] },
  }
}

function withCarPlay(config) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.carplay-audio'] = true
    return c
  })
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = addCarPlayScene(c.modResults.UIApplicationSceneManifest)
    return c
  })
}

module.exports = withCarPlay
module.exports.addCarPlayScene = addCarPlayScene
