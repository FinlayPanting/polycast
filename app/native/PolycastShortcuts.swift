import AppIntents
import Foundation

// App Shortcuts (PC-1021-09): Siri, Spotlight and the Action button can carry on the last listen
// or play the newest episode of a followed show. Copied into the app target by
// plugins/withAppShortcuts.js (App Shortcuts must live in the app itself). Each shortcut opens
// Polycast and leaves a note the app reads (modules/polycast-shortcuts); nothing else runs here.

enum PolycastShortcutStore {
  static let showsKey = "polycast.shortcuts.shows"
  static let pendingKey = "polycast.shortcuts.pending"
  static let shortcutRan = Notification.Name("PolycastShortcut")

  static func shows() -> [ShowEntity] {
    let raw = UserDefaults.standard.array(forKey: showsKey) as? [[String: String]] ?? []
    return raw.compactMap { d in
      guard let id = d["id"], let title = d["title"] else { return nil }
      return ShowEntity(id: id, title: title)
    }
  }

  static func request(_ action: String) {
    UserDefaults.standard.set(action, forKey: pendingKey)
    NotificationCenter.default.post(name: shortcutRan, object: nil)
  }
}

struct ShowEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static let defaultQuery = ShowQuery()

  var id: String
  var title: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(title)")
  }
}

struct ShowQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ShowEntity] {
    PolycastShortcutStore.shows().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [ShowEntity] {
    PolycastShortcutStore.shows()
  }
}

struct CarryOnListeningIntent: AppIntent {
  static let title: LocalizedStringResource = "Carry on listening"
  static let description = IntentDescription("Picks up your last Polycast lesson where you left off.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    PolycastShortcutStore.request("continue")
    return .result()
  }
}

struct PlayNewestEpisodeIntent: AppIntent {
  static let title: LocalizedStringResource = "Play the newest episode"
  static let description = IntentDescription("Opens the newest episode of a show you follow.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Show")
  var show: ShowEntity

  @MainActor
  func perform() async throws -> some IntentResult {
    PolycastShortcutStore.request("show:\(show.id)")
    return .result()
  }
}

struct PolycastAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: CarryOnListeningIntent(),
      phrases: [
        "Carry on listening in \(.applicationName)",
        "Carry on my podcast in \(.applicationName)",
        "Continue my lesson in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: PlayNewestEpisodeIntent(),
      phrases: [
        "Play the newest \(\.$show) in \(.applicationName)",
        "Play the newest episode in \(.applicationName)",
      ]
    )
  }
}
