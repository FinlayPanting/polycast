// App Shortcuts (PC-1021-09) must be compiled into the app target itself, so this copies
// native/PolycastShortcuts.swift into the generated iOS project and adds it to the app's sources.
const fs = require('fs')
const path = require('path')
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins')

const FILE = 'PolycastShortcuts.swift'

function withAppShortcuts(config) {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot)
      fs.copyFileSync(path.join(c.modRequest.projectRoot, 'native', FILE), path.join(c.modRequest.platformProjectRoot, name, FILE))
      return c
    },
  ])
  return withXcodeProject(config, (c) => {
    const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot)
    const filepath = `${name}/${FILE}`
    if (!c.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: c.modResults })
    }
    return c
  })
}

module.exports = withAppShortcuts
