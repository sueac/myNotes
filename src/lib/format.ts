
export const pad = (n: number) => String(n).padStart(2, '0')

export const formatTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// The "YYYY-MM-DDTHH:mm" local-time text that <input type="datetime-local"> reads and writes.
export const toDateTimeLocal = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Short "in 5 min" / "in 3 h" / "in 2 days" text, or "Due" once the time has passed.
export const formatRelative = (ts: number, now: number) => {
  const mins = Math.ceil((ts - now) / 60000)
  if (mins <= 0) return 'Due'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours} h`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}
