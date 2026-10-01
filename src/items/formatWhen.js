// SPEC.md 19.2: "who and when" for recently updated items - "היום 14:05",
// "אתמול 09:12", or a full date for anything older.
export function formatWhen(iso, t, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  if (d >= startOfToday) return `${t('time.today')} ${time}`;
  if (d >= startOfYesterday) return `${t('time.yesterday')} ${time}`;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
