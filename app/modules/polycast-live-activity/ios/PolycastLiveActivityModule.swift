import ActivityKit
import ExpoModulesCore

struct LiveLineRecord: Record {
  @Field var show: String = ""
  @Field var line: String = ""
  @Field var english: String = ""
  @Field var next: String = ""
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
}

public class PolycastLiveActivityModule: Module {
  /// The Activity showing, as Any so the module still loads on iOS before 16.2.
  private var current: Any?

  public func definition() -> ModuleDefinition {
    Name("PolycastLiveActivity")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("show") { (record: LiveLineRecord) async -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      let start = Date(timeIntervalSince1970: record.startMs / 1000)
      let end = max(start, Date(timeIntervalSince1970: record.endMs / 1000))
      let state = PolycastLineAttributes.ContentState(line: record.line, english: record.english, next: record.next, start: start, end: end)
      let content = ActivityContent(state: state, staleDate: nil)
      if let activity = self.current as? Activity<PolycastLineAttributes>, activity.activityState == .active {
        await activity.update(content)
        return true
      }
      do {
        self.current = try Activity.request(attributes: PolycastLineAttributes(show: record.show), content: content, pushType: nil)
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("end") { () async in
      guard #available(iOS 16.2, *) else { return }
      if let activity = self.current as? Activity<PolycastLineAttributes> {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      self.current = nil
      // Any left over from a listen the app didn't get to close (it was quit mid-episode).
      for activity in Activity<PolycastLineAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
