import EventKit
import Foundation

@MainActor
final class CalendarBridge {
    private let store = EKEventStore()

    func createEvent(from payload: [String: Any]) async -> [String: Any] {
        guard let title = payload["title"] as? String,
              let startText = payload["start"] as? String,
              let start = parseLocalDate(startText) else {
            return ["ok": false, "status": "invalid_event"]
        }

        do {
            guard try await ensureWriteAccess() else {
                return ["ok": false, "status": "permission_denied"]
            }
            guard let targetCalendar = store.defaultCalendarForNewEvents else {
                return ["ok": false, "status": "no_calendar"]
            }

            let duration = max(5, min(1440, payload["durationMinutes"] as? Int ?? 15))
            let alarm = max(0, min(10080, payload["alarmMinutes"] as? Int ?? 0))
            let event = EKEvent(eventStore: store)
            event.title = title
            event.startDate = start
            event.endDate = start.addingTimeInterval(TimeInterval(duration * 60))
            event.calendar = targetCalendar
            if let notes = payload["notes"] as? String { event.notes = String(notes.prefix(500)) }
            event.addAlarm(EKAlarm(relativeOffset: TimeInterval(-alarm * 60)))
            try store.save(event, span: .thisEvent, commit: true)
            return ["ok": true, "status": "saved"]
        } catch {
            return ["ok": false, "status": "save_failed"]
        }
    }

    private func ensureWriteAccess() async throws -> Bool {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .writeOnly, .fullAccess: return true
        case .notDetermined: return try await store.requestWriteOnlyAccessToEvents()
        case .denied, .restricted: return false
        @unknown default: return false
        }
    }

    private func parseLocalDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Europe/Berlin")
        formatter.dateFormat = value.count == 16 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd'T'HH:mm:ss"
        return formatter.date(from: value)
    }
}
