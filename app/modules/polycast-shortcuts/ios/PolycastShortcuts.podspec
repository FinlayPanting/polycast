Pod::Spec.new do |s|
  s.name           = 'PolycastShortcuts'
  s.version        = '1.0.0'
  s.summary        = 'Hands Siri and Spotlight shortcuts over to the Polycast app'
  s.description    = 'Keeps followed shows for App Shortcuts and passes a shortcut that was run to JavaScript (PC-1021-09).'
  s.author         = 'Polycast'
  s.homepage       = 'https://polycast.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
