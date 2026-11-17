import AppKit

final class ReturnProvider: NSObject {
 @objc func editInStudio(_ pasteboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
  guard let host=NSWorkspace.shared.frontmostApplication?.bundleIdentifier else { error.pointee="Logiciel actif non identifié.";return }
  let targets=["com.adobe.AfterEffects.application":"after_effects","com.adobe.Photoshop":"photoshop","com.adobe.PremierePro":"premiere","com.blackmagic-design.DaVinciResolve":"resolve","org.blenderfoundation.blender":"blender"]
  guard let target=targets[host] else { error.pointee="Utiliser ce service dans After Effects, Photoshop ou Resolve. Premiere et Blender ont leur bouton dans le panneau Révélation.";return }
  let rootFile=Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/studio-root.txt")
  guard let path=try? String(contentsOf:rootFile,encoding:.utf8).trimmingCharacters(in:.whitespacesAndNewlines) else{return}
  let root=URL(fileURLWithPath:path),process=Process(),pipe=Pipe()
  process.executableURL=root.appendingPathComponent(".venv/bin/python");process.arguments=["-m","app.host_shortcut",target];process.currentDirectoryURL=root
  var env=ProcessInfo.processInfo.environment;env["PYTHONPATH"]=root.path;process.environment=env;process.standardError=pipe;process.standardOutput=FileHandle.nullDevice
  do { try process.run();process.waitUntilExit();if process.terminationStatus != 0 {error.pointee=(String(data:pipe.fileHandleForReading.readDataToEndOfFile(),encoding:.utf8) ?? "Retour au Studio impossible.") as NSString} }
  catch let problem {error.pointee=problem.localizedDescription as NSString}
 }
}
@main struct Entry {
 static func main(){let app=NSApplication.shared;let provider=ReturnProvider();app.setActivationPolicy(.prohibited);app.servicesProvider=provider;NSUpdateDynamicServices();withExtendedLifetime(provider){app.run()}}
}
