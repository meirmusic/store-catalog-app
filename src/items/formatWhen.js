// SPEC.md 19.2 / 22.5: times are always 24-hour ("14:05", never "02:05 PM").
const pad = (n) => String(n).padStart(2, '0');

function parse(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "היום 14:05", "אתמול 09:12", or a date for anything older. With
// `omitToday`, today is just "14:05" (e.g. "לא עודכן מאז 14:05").
export function formatWhen(iso, t, now = new Date(), { omitToday = false } = {}) {
  const d = parse(iso);
  if (!d) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  if (d >= startOfToday) return omitToday ? formatTime(d) : `${t('time.today')} ${formatTime(d)}`;
  if (d >= startOfYesterday) return `${t('time.yesterday')} ${formatTime(d)}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// A full date and time, e.g. "30/09/2026 14:05".
export function formatDateTime(iso) {
  const d = parse(iso);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(d)}`;
}
