import AppKit
import WebKit

@main
struct Entry {
 static func main() {
  let app = NSApplication.shared
  let delegate = StudioDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.regular)
  app.run()
  withExtendedLifetime(delegate) {}
 }
}

class StudioDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
 let root: URL = {
  if let configured=ProcessInfo.processInfo.environment["REVELATION_STUDIO_ROOT"] { return URL(fileURLWithPath:configured) }
  let bundled=Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/studio")
  return FileManager.default.fileExists(atPath:bundled.appendingPathComponent("app/server.py").path) ? bundled : Bundle.main.bundleURL.deletingLastPathComponent()
 }()
 var window: NSWindow!
 var web: WKWebView!
 var server: Process?
 var timer: Timer?
 var attempts = 0
 var pendingJob: String?

 func applicationDidFinishLaunching(_ notification: Notification) {
  let config = WKWebViewConfiguration()
  config.userContentController.add(self, name: "studio")
  config.preferences.javaScriptCanOpenWindowsAutomatically = true
  web = WKWebView(frame: .zero, configuration: config)
  web.navigationDelegate = self; web.uiDelegate = self
  window = NSWindow(contentRect: NSRect(x:0,y:0,width:1320,height:880),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
  window.title = "Révélation AI Studio"
  window.minSize = NSSize(width:900,height:650)
  window.contentView = web; window.center(); window.makeKeyAndOrderFront(nil)
  NSApp.activate(ignoringOtherApps:true)
  let menu = NSMenu(); let main = NSMenuItem(); menu.addItem(main)
  let submenu = NSMenu(); submenu.addItem(withTitle:"Quitter Révélation AI Studio",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q"); main.submenu = submenu; NSApp.mainMenu = menu
  checkServer(first:true)
 }

 func checkServer(first:Bool=false) {
  guard let url=URL(string:"http://127.0.0.1:8848/api/bootstrap") else{return}
  var request=URLRequest(url:url);request.timeoutInterval=2
  URLSession.shared.dataTask(with:request){[weak self] data,response,error in
   DispatchQueue.main.async {
    guard let self=self else{return}
    if let http=response as? HTTPURLResponse,http.statusCode==200 {
     self.timer?.invalidate(); self.web.load(URLRequest(url:URL(string:"http://127.0.0.1:8848/?app_version=0.8.0"+(self.pendingJob.map { "&job="+$0 } ?? ""))!));return
    }
    if first { self.startServer() }
    self.attempts+=1
    if self.attempts>30 { self.web.loadHTMLString("<body style='background:#17191f;color:#eee;font:16px -apple-system;padding:50px'><h1>Le Studio ne démarre pas.</h1><p>Consultez verification/serveur_mac.log dans le dossier de l’application.</p></body>",baseURL:nil);return }
    self.timer=Timer.scheduledTimer(withTimeInterval:1,repeats:false){_ in self.checkServer()}
   }
  }.resume()
 }

 func startServer() {
  let p=Process();p.executableURL=root.appendingPathComponent(".venv/bin/python")
  p.arguments=["-m","uvicorn","app.server:app","--host","127.0.0.1","--port","8848"]
  p.currentDirectoryURL=root
  var env=ProcessInfo.processInfo.environment;env["PYTHONPATH"]=root.path;p.environment=env
  try? FileManager.default.createDirectory(at:root.appendingPathComponent("verification"),withIntermediateDirectories:true)
  let log=root.appendingPathComponent("verification/serveur_mac.log")
  FileManager.default.createFile(atPath:log.path,contents:nil)
  if let handle=try? FileHandle(forWritingTo:log){p.standardOutput=handle;p.standardError=handle}
  do{try p.run();server=p}catch{web.loadHTMLString("Échec du moteur local : \(error)",baseURL:nil)}
 }

 func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
  guard message.frameInfo.isMainFrame,message.frameInfo.securityOrigin.host=="127.0.0.1",let d=message.body as? [String:String],let action=d["action"] else{return}
  if action=="open_app",let target=d["target"] {
   if ["after_effects","photoshop","premiere","resolve","blender"].contains(target) {
    web.evaluateJavaScript("api('/api/connections/"+target+"/open',{}).catch(e=>toast(e.message))",completionHandler:nil)
   }
  }
  if action=="connectors",let target=d["target"],["photoshop","premiere","after_effects","blender"].contains(target){NSWorkspace.shared.open(root.appendingPathComponent("connecteurs/"+target))}
  if action=="reveal_job",let id=d["id"],id.range(of:"^[a-f0-9]{12}$",options:.regularExpression) != nil {NSWorkspace.shared.open(root)}
 }
 func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for navigationAction:WKNavigationAction,windowFeatures:WKWindowFeatures)->WKWebView?{
  if let url=navigationAction.request.url{NSWorkspace.shared.open(url)};return nil
 }
 func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
  guard let url=navigationAction.request.url else{decisionHandler(.cancel);return}
  if ["127.0.0.1","localhost"].contains(url.host ?? "") {
   if url.path.hasPrefix("/api/files/") {
    let parts=url.pathComponents
    if parts.count==5,parts[3].range(of:"^[a-f0-9]{12}$",options:.regularExpression) != nil {
     let bodyData=try? JSONSerialization.data(withJSONObject:["filename":parts[4]])
     let body=bodyData.flatMap { String(data:$0,encoding:.utf8) } ?? "{}"
     let script="api('/api/jobs/"+parts[3]+"/open',"+body+").catch(e=>toast(e.message))"
     web.evaluateJavaScript(script,completionHandler:nil);decisionHandler(.cancel);return
    }
   }
   decisionHandler(.allow)
  } else if url.scheme=="about" { decisionHandler(.allow) }
  else { NSWorkspace.shared.open(url);decisionHandler(.cancel) }
 }
 func application(_ application:NSApplication, open urls:[URL]) {
  for url in urls where url.scheme=="revelationstudio" && url.host=="edit" {
   guard let jid=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="job"})?.value,jid.range(of:"^[a-f0-9]{12}$",options:.regularExpression) != nil else {continue}
   pendingJob=jid
   if let view=web {
    view.evaluateJavaScript("if(window.StudioReturn&&boot&&boot.auth&&boot.auth.authenticated){StudioReturn.openJob('"+jid+"')}else{location.href='/?job="+jid+"'}",completionHandler:nil)
    window?.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
   }
  }
 }
 func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{return true}
 func applicationWillTerminate(_ notification:Notification){timer?.invalidate();if let p=server,p.isRunning{p.terminate()}}
}
