# Sofia iOS shell

Native iOS layer for Sofia. The existing Vercel application remains the UI and backend. WKWebView loads the production app and exposes a native Calendar bridge backed by EventKit.

## Xcode setup

1. Create an iOS App target named Sofia with iOS 17 or later.
2. Add the Swift files in this folder to the target.
3. Add the Info.plist key NSCalendarsWriteOnlyAccessUsageDescription with a user-facing explanation that Sofia needs calendar access to create requested events.
4. Choose your Apple Development team and a unique bundle identifier.
5. Build to the iPhone.

The web app detects window.webkit.messageHandlers.calendar. In the native shell it writes through EventKit; Safari/PWA retains the ICS fallback.
