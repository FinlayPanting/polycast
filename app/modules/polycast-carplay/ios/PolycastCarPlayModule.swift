import ExpoModulesCore

/// The car screen (PolycastCarPlaySceneDelegate) and JavaScript talk through these notifications,
/// because the CarPlay scene can connect before or after the React Native bridge is up.
let carPlayItemsChanged = Notification.Name("PolycastCarPlayItems")
let carPlaySelected = Notification.Name("PolycastCarPlaySelect")
let carPlayMessage = Notification.Name("PolycastCarPlayMessage")

/// What the car's list shows, kept so a car that connects later still sees it.
final class CarPlayState {
  static let shared = CarPlayState()
  var items: [[String: String]] = []
  var emptyText = ""
  /// A pick made before JavaScript was listening (CarPlay can launch the app on its own).
  var pending: String?
}

public class PolycastCarPlayModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("PolycastCarPlay")

    Events("onSelect")

    Function("setItems") { (items: [[String: String]], emptyText: String) in
      DispatchQueue.main.async {
        CarPlayState.shared.items = items
        CarPlayState.shared.emptyText = emptyText
        NotificationCenter.default.post(name: carPlayItemsChanged, object: nil)
      }
    }

    Function("showMessage") { (text: String) in
      DispatchQueue.main.async {
        NotificationCenter.default.post(name: carPlayMessage, object: nil, userInfo: ["text": text])
      }
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(forName: carPlaySelected, object: nil, queue: .main) { [weak self] note in
        if let id = note.userInfo?["id"] as? String {
          CarPlayState.shared.pending = nil
          self?.sendEvent("onSelect", ["id": id])
        }
      }
      if let id = CarPlayState.shared.pending {
        CarPlayState.shared.pending = nil
        self.sendEvent("onSelect", ["id": id])
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
