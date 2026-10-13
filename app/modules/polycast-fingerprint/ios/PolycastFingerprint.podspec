Pod::Spec.new do |s|
  s.name           = 'PolycastFingerprint'
  s.version        = '1.0.0'
  s.summary        = 'Fingerprints episode audio so Polycast lessons follow each listener\'s copy'
  s.description    = 'Decodes an audio file to 8 kHz mono and returns the loudness of every 50 ms, as in @polycast/core sync.ts.'
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
