import ExpoModulesCore

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
      UserDefaults.standard.set(shows, forKey: showsKey)
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
