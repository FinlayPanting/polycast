import ActivityKit
import Foundation

/// The lock-screen transcript line (PC-1020-L1). This file is kept identical in
/// app/modules/polycast-live-activity/ios and app/targets/live-line: iOS matches the app's
/// Activity to the widget by this type's name and fields (a test checks the copies agree).
@available(iOS 16.1, *)
public struct PolycastLineAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var line: String
    public var english: String
    public var next: String
    public var start: Date
    public var end: Date

    public init(line: String, english: String, next: String, start: Date, end: Date) {
      self.line = line
      self.english = english
      self.next = next
      self.start = start
      self.end = end
    }
  }

  public var show: String

  public init(show: String) {
    self.show = show
  }
}
