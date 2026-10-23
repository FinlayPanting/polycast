import CarPlay
import UIKit

/// The car screen (PC-1022-10): one list, "Carry on" and the followed shows. Picking one hands it
/// to JavaScript, which starts the listen on the phone as the Siri shortcuts do; audio goes to the
/// car through the app's existing now-playing session. Named for Info.plist by withCarPlay.js.
@objc(PolycastCarPlaySceneDelegate)
public class PolycastCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interfaceController: CPInterfaceController?
  private var observers: [NSObjectProtocol] = []

  public func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
    self.interfaceController = interfaceController
    interfaceController.setRootTemplate(makeList(), animated: false, completion: nil)
    observers.append(NotificationCenter.default.addObserver(forName: carPlayItemsChanged, object: nil, queue: .main) { [weak self] _ in
      guard let self = self, let list = self.interfaceController?.rootTemplate as? CPListTemplate else { return }
      list.updateSections(self.sections())
      list.emptyViewSubtitleVariants = [CarPlayState.shared.emptyText]
    })
    observers.append(NotificationCenter.default.addObserver(forName: carPlayMessage, object: nil, queue: .main) { [weak self] note in
      guard let text = note.userInfo?["text"] as? String else { return }
      let alert = CPAlertTemplate(titleVariants: [text], actions: [CPAlertAction(title: "OK", style: .cancel) { [weak self] _ in
        self?.interfaceController?.dismissTemplate(animated: true, completion: nil)
      }])
      self?.interfaceController?.presentTemplate(alert, animated: true, completion: nil)
    })
  }

  public func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnect interfaceController: CPInterfaceController) {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
    self.interfaceController = nil
  }

  private func makeList() -> CPListTemplate {
    let list = CPListTemplate(title: "Polycast", sections: sections())
    list.emptyViewSubtitleVariants = [CarPlayState.shared.emptyText]
    return list
  }

  private func sections() -> [CPListSection] {
    let items: [CPListItem] = CarPlayState.shared.items.compactMap { entry in
      guard let id = entry["id"], let title = entry["title"] else { return nil }
      let item = CPListItem(text: title, detailText: entry["detail"])
      item.handler = { [weak self] _, completion in
        self?.select(id)
        completion()
      }
      return item
    }
    return [CPListSection(items: items)]
  }

  private func select(_ id: String) {
    CarPlayState.shared.pending = id
    NotificationCenter.default.post(name: carPlaySelected, object: nil, userInfo: ["id": id])
    interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
  }
}

/// With a scene manifest in Info.plist (needed for CarPlay), the phone also runs as a scene. This
/// hands the window Expo's AppDelegate already built to the phone's scene, so the app looks and
/// starts exactly as before.
@objc(PolycastPhoneSceneDelegate)
public class PolycastPhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  public var window: UIWindow?

  public func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appWindow = UIApplication.shared.delegate?.window ?? nil else { return }
    appWindow.windowScene = windowScene
    appWindow.makeKeyAndVisible()
    window = appWindow
  }
}
