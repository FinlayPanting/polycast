import ExpoModulesCore
import Foundation

/// Must match app/native/PolycastShortcuts.swift (the App Shortcuts, built into the app itself).
private let showsKey = "polycast.shortcuts.shows"
private let pendingKey = "polycast.shortcuts.pending"
private let shortcutRan = Notification.Name("PolycastShortcut")

public class PolycastShortcutsModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("PolycastShortcuts")

    Events("onShortcut")

    /// The learner's followed shows, offered by "Play the newest episode".
    Function("setShows") { (shows: [[String: String]]) in
      let before = UserDefaults.standard.array(forKey: showsKey) as? [[String: String]]
      UserDefaults.standard.set(shows, forKey: showsKey)
      // Siri re-reads the show names only when told (PC-1022-03). The provider lives in the app
      // target (native/PolycastShortcuts.swift), so it's reached by its Objective-C name.
      if before != shows, let refresher: AnyObject = NSClassFromString("PolycastShortcutsRefresher") {
        let refresh = NSSelectorFromString("refresh")
        if refresher.responds(to: refresh) {
          DispatchQueue.main.async { _ = refresher.perform(refresh) }
        }
      }
    }

    /// The shortcut run most recently, if the app hasn't handled it yet ("continue" or "show:<id>").
    Function("takePending") { () -> String? in
      let action = UserDefaults.standard.string(forKey: pendingKey)
      UserDefaults.standard.removeObject(forKey: pendingKey)
      return action
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(forName: shortcutRan, object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onShortcut", [:])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
