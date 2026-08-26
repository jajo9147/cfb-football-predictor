import UIKit
import WebKit
import AuthenticationServices

class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    private var webView: WKWebView!
    private let impactFeedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let selectionFeedbackGenerator = UISelectionFeedbackGenerator()
    private let notificationFeedbackGenerator = UINotificationFeedbackGenerator()

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 7/255.0, green: 9/255.0, blue: 14/255.0, alpha: 1.0)
        setupWebView()
        loadLocalWebContent()
    }

    private func setupWebView() {
        let contentController = WKUserContentController()
        contentController.add(self, name: "haptic")
        contentController.add(self, name: "share")
        contentController.add(self, name: "toast")
        contentController.add(self, name: "appleSignIn")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 7/255.0, green: 9/255.0, blue: 14/255.0, alpha: 1.0)
        webView.scrollView.backgroundColor = UIColor(red: 7/255.0, green: 9/255.0, blue: 14/255.0, alpha: 1.0)
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.scrollView.bounces = true

        view.addSubview(webView)
    }

    private func loadLocalWebContent() {
        if let wwwUrl = Bundle.main.url(forResource: "www", withExtension: nil) {
            let indexUrl = wwwUrl.appendingPathComponent("index.html")
            webView.loadFileURL(indexUrl, allowingReadAccessTo: wwwUrl)
        } else if let indexUrl = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(indexUrl, allowingReadAccessTo: indexUrl.deletingLastPathComponent())
        } else {
            // Remote fallback if local bundle is missing
            if let remoteUrl = URL(string: "https://jajo9147.github.io/cfb-football-predictor/") {
                webView.load(URLRequest(url: remoteUrl))
            }
        }
    }

    // MARK: - Native Sign in with Apple

    private func performAppleSignIn() {
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = self
        authorizationController.presentationContextProvider = self
        authorizationController.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.view.window ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential {
            let userIdentifier = appleIDCredential.user
            var fullNameStr = "Apple User"
            if let fullName = appleIDCredential.fullName {
                let given = fullName.givenName ?? ""
                let family = fullName.familyName ?? ""
                let combined = "\(given) \(family)".trimmingCharacters(in: .whitespaces)
                if !combined.isEmpty {
                    fullNameStr = combined
                }
            }
            let emailStr = appleIDCredential.email ?? "\(userIdentifier.prefix(8))@privaterelay.appleid.com"

            let payload: [String: Any] = [
                "userId": userIdentifier,
                "fullName": fullNameStr,
                "email": emailStr
            ]

            if let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                DispatchQueue.main.async {
                    self.webView.evaluateJavaScript("if (window.handleAppleSignInResult) { window.handleAppleSignInResult(\(jsonString)); }", completionHandler: nil)
                }
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        print("Apple Sign In didCompleteWithError: \(error.localizedDescription)")
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "appleSignIn" {
            DispatchQueue.main.async {
                self.performAppleSignIn()
            }
        } else if message.name == "haptic" {
            let type = message.body as? String ?? "medium"
            DispatchQueue.main.async {
                switch type {
                case "light":
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                case "heavy":
                    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                case "success":
                    self.notificationFeedbackGenerator.notificationOccurred(.success)
                case "warning":
                    self.notificationFeedbackGenerator.notificationOccurred(.warning)
                case "error":
                    self.notificationFeedbackGenerator.notificationOccurred(.error)
                case "select":
                    self.selectionFeedbackGenerator.selectionChanged()
                default:
                    self.impactFeedbackGenerator.impactOccurred()
                }
            }
        } else if message.name == "share" {
            guard let shareDict = message.body as? [String: Any] else { return }
            let title = shareDict["title"] as? String ?? "CFB Prophet Prediction"
            let text = shareDict["text"] as? String ?? "Check out my college football simulation on CFB Prophet!"
            var items: [Any] = [title, text]
            if let urlStr = shareDict["url"] as? String, let url = URL(string: urlStr) {
                items.append(url)
            }
            DispatchQueue.main.async {
                let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
                if let popover = activityVC.popoverPresentationController {
                    popover.sourceView = self.view
                    popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 0, height: 0)
                    popover.permittedArrowDirections = []
                }
                self.present(activityVC, animated: true)
            }
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            if url.scheme == "file" || url.host == "jajo9147.github.io" || url.host == "cdn.jsdelivr.net" || url.host == "cdnjs.cloudflare.com" || url.host == "fonts.googleapis.com" || url.host == "fonts.gstatic.com" || url.host == "a.espncdn.com" {
                decisionHandler(.allow)
                return
            }
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }
}
