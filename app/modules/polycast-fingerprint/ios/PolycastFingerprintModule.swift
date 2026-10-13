import AVFoundation
import ExpoModulesCore

/// Must match @polycast/core sync.ts exactly: 8 kHz mono 16-bit samples, 400 samples (50 ms) a
/// frame, each frame's value = round(log10(mean square + 1) * 25), clamped to a byte.
private let sampleRate: Double = 8000
private let hop = 400
private let scale = 25.0

private func frameValue(_ sumOfSquares: Double) -> UInt8 {
  let v = (log10(sumOfSquares / Double(hop) + 1) * scale).rounded()
  return UInt8(max(0, min(255, v)))
}

internal final class FingerprintFailedException: GenericException<String> {
  override var reason: String { "Couldn't read the episode's audio: \(param)" }
}

public class PolycastFingerprintModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PolycastFingerprint")

    /// Fingerprints a downloaded episode (a file:// URI). Returns the frames as base64.
    AsyncFunction("fingerprint") { (uri: String) async throws -> String in
      guard let url = URL(string: uri) else { throw FingerprintFailedException("not a file address") }
      let asset = AVURLAsset(url: url)
      let tracks = try await asset.loadTracks(withMediaType: .audio)
      guard let track = tracks.first else { throw FingerprintFailedException("no audio track") }

      let reader = try AVAssetReader(asset: asset)
      let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ])
      output.alwaysCopiesSampleData = false
      guard reader.canAdd(output) else { throw FingerprintFailedException("can't decode this format") }
      reader.add(output)
      guard reader.startReading() else {
        throw FingerprintFailedException(reader.error?.localizedDescription ?? "decoder didn't start")
      }

      var frames = [UInt8]()
      var sum = 0.0
      var count = 0
      var samples = [Int16]()
      while let buffer = output.copyNextSampleBuffer() {
        guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
        let length = CMBlockBufferGetDataLength(block)
        let n = length / 2
        if samples.count < n { samples = [Int16](repeating: 0, count: n) }
        let status = samples.withUnsafeMutableBytes { raw in
          CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: n * 2, destination: raw.baseAddress!)
        }
        if status != kCMBlockBufferNoErr { continue }
        for i in 0..<n {
          let s = Double(samples[i])
          sum += s * s
          count += 1
          if count == hop {
            frames.append(frameValue(sum))
            sum = 0
            count = 0
          }
        }
      }
      if reader.status == .failed {
        throw FingerprintFailedException(reader.error?.localizedDescription ?? "decoding failed")
      }
      return Data(frames).base64EncodedString()
    }
  }
}
