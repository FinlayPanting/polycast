Pod::Spec.new do |s|
  s.name           = 'PolycastCarPlay'
  s.version        = '1.0.0'
  s.summary        = 'Polycast in CarPlay'
  s.description    = 'Shows Carry on and followed shows on the car screen and passes a pick to JavaScript (PC-1022-10).'
  s.author         = 'Polycast'
  s.homepage       = 'https://polycast.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CarPlay'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
