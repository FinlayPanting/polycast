Pod::Spec.new do |s|
  s.name           = 'PolycastLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Shows the line being said on the lock screen as a Live Activity'
  s.description    = 'Starts, updates and ends the Polycast transcript Live Activity (PC-1020-L1).'
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
