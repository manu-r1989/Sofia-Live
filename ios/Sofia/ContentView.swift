import SwiftUI

struct ContentView: View {
    var body: some View {
        SofiaWebView(url: URL(string: "https://sofia-live-xi.vercel.app")!)
            .ignoresSafeArea()
    }
}
