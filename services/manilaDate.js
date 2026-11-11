function manilaDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function isTodayOrFutureInManila(value, now = new Date()) {
  if (value === null || value === undefined) return false;
  const travelDate = new Date(value);
  if (Number.isNaN(travelDate.getTime())) return false;
  const todayStart = new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
  return travelDate >= todayStart;
}

module.exports = { isTodayOrFutureInManila, manilaDateKey };
