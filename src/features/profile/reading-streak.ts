/** Returns a calendar key in the device's local timezone, never UTC. */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(key: string, offset: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

export function calculateCurrentStreak(activeDays: readonly string[], today = localDateKey()) {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : shiftDateKey(today, -1);
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function calculateBestStreak(activeDays: readonly string[]) {
  const days = new Set(activeDays);
  let best = 0;
  let endDate: string | null = null;
  for (const day of [...days].sort()) {
    if (days.has(shiftDateKey(day, -1))) continue;
    let length = 1;
    let cursor = shiftDateKey(day, 1);
    while (days.has(cursor)) {
      length += 1;
      cursor = shiftDateKey(cursor, 1);
    }
    if (length > best) {
      best = length;
      endDate = shiftDateKey(cursor, -1);
    }
  }
  return { length: best, endDate };
}
