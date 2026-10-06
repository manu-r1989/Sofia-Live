/* V4.20.1: display existing action results; never execute or retry actions. */
(() => {
  "use strict";
  let panel;
  function view(result) {
    if (!result || typeof result !== "object") return null;
    const title = typeof result.task?.title === "string" ? result.task.title.slice(0, 180) : "";
    if (result.ok === false) {
      const messages = {
        ambiguous: "Rückfrage: Welche Aufgabe meinst du?",
        missing_due_at: "Rückfrage: Datum und Uhrzeit fehlen.",
        in_progress: "Wird verarbeitet. Keine erneute Ausführung nötig.",
        execution_failed: "Ausgang unbestätigt. Aufgabenstand vor einer Wiederholung prüfen."
      };
      return { kind: result.status === "in_progress" ? "pending" : ["ambiguous", "missing_due_at"].includes(result.status) ? "question" : "uncertain",
        text: Object.prototype.hasOwnProperty.call(messages, result.status) ? messages[result.status] : messages.execution_failed };
    }
    if (result.ok !== true) return null;
    const labels = { create: "Gespeichert", update: "Aktualisiert", delete: "Gelöscht", complete: "Erledigt",
      complete_recurring: "Erledigt · nächster Termin gesetzt", create_existing: "Bereits vorhanden", calendar_export: "Kalenderimport vorbereitet" };
    if (result.action === "list") return Array.isArray(result.tasks)
      ? { kind: "info", text: "Aufgaben gefunden: " + result.tasks.length } : null;
    if (!labels[result.action] || !title) return null;
    let text = labels[result.action] + ": „" + title + "“";
    const due = result.action === "complete_recurring" ? result.nextDueAt : result.task?.dueAt;
    if (due && ["create", "update", "complete_recurring"].includes(result.action)) {
      try {
        // Use the existing Berlin wall-time resolver, not the device time zone.
        if (typeof calendarStartDate === "function") text += " · " + new Intl.DateTimeFormat("de-DE", {
          timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(calendarStartDate(due)) + " (Berlin)";
      } catch { /* Invalid dates do not invent a replacement appointment. */ }
    }
    return { kind: ["create_existing", "calendar_export"].includes(result.action) ? "info" : "success", text };
  }
  function ensurePanel() {
    if (panel?.isConnected) return panel;
    const messages = document.getElementById("messages");
    if (!messages?.parentNode) return null;
    panel = document.createElement("div");
    panel.id = "sofia-action-feedback";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.style.cssText = "margin:6px 12px;padding:8px 10px;border:1px solid rgba(255,255,255,.16);border-radius:10px;font-size:12px;line-height:1.4;overflow-wrap:anywhere;flex-shrink:0;";
    panel.hidden = true;
    messages.parentNode.insertBefore(panel, messages);
    return panel;
  }
  function clear() { if (panel) { panel.hidden = true; panel.textContent = ""; delete panel.dataset.result; } }
  function show(result) {
    const value = view(result);
    if (!value) { clear(); return; }
    const element = ensurePanel();
    if (!element) return;
    element.textContent = value.text;
    element.dataset.result = value.kind;
    element.hidden = false;
  }
  window.SofiaActionFeedback = { show, clear };
})();
