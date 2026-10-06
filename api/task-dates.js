// Task timestamps represent Europe/Berlin wall time without an offset.
// UTC is used only as an arithmetic calendar, never as the event timezone.
function wallDate(value) {
  const text = String(value || "").trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) return null;
  const stamp = text.length === 16 ? text + ":00" : text;
  const date = new Date(stamp + "Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === stamp ? date : null;
}

const stampOf = date => date.toISOString().slice(0, 19);

export function addCalendarDays(value, days) {
  const date = wallDate(value);
  if (!date || !Number.isInteger(days)) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return stampOf(date);
}

export function nextRecurringDates(task) {
  const previousDue = wallDate(task.dueAt);
  if (!previousDue) return null;
  const next = new Date(previousDue);
  if (task.recurrence === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (task.recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (task.recurrence === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  } else return null;
  const reminder = wallDate(task.remindAt);
  return {
    dueAt: stampOf(next),
    remindAt: reminder ? stampOf(new Date(next.getTime() + reminder.getTime() - previousDue.getTime())) : null
  };
}
