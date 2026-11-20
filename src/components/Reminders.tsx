import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Reminder } from '../types'
import { useReminders } from '../hooks/useReminders.ts'
import { formatRelative, formatTime, toDateTimeLocal } from '../lib/format.ts'
import { enableNotifications } from '../lib/push'
import { ICON } from '../lib/icons.ts'
import { Icon } from './Icon'

const MAX_LENGTH = 200

const notificationsGranted = () =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted'

// A separate panel for adding reminders and seeing which are due or coming up.
export function Reminders({ userId, now }: { userId: string; now: Date }) {
  const { reminders, ready, syncError, addReminder, removeReminder } = useReminders(userId)
  const [text, setText] = useState('')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [alertsOn, setAlertsOn] = useState(notificationsGranted)
  const [alertsMsg, setAlertsMsg] = useState<string | null>(null)

  const nowMs = now.getTime()
  const sorted = useMemo(
    () => [...reminders].sort((a, b) => a.remindAt - b.remindAt),
    [reminders],
  )
  const due = sorted.filter((r) => r.remindAt <= nowMs)
  const upcoming = sorted.filter((r) => r.remindAt > nowMs)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = text.trim()
    // datetime-local text has no time zone, so Date reads it as local time.
    const remindAt = new Date(when).getTime()
    if (!trimmed) return setFormError('Write what you want to be reminded about.')
    if (Number.isNaN(remindAt)) return setFormError('Pick a date and time.')
    if (remindAt <= Date.now()) return setFormError('Pick a time in the future.')

    setFormError(null)
    setSaving(true)
    const ok = await addReminder(trimmed, remindAt)
    setSaving(false)
    if (ok) {
      setText('')
      setWhen('')
    }
  }

  // Reminders are delivered as push notifications, so this browser needs a push subscription.
  async function turnOnAlerts() {
    setAlertsMsg(null)
    try {
      await enableNotifications(userId)
      setAlertsOn(true)
    } catch (err) {
      setAlertsMsg(err instanceof Error ? err.message : 'Could not turn on alerts')
    }
  }

  const message = formError ?? syncError

  return (
    <section className="reminders" aria-label="Reminders">
      <h2 className="reminders-head">
        <Icon d={ICON.bell} size={22} /> Reminders
      </h2>

      {!alertsOn && (
        <div className="reminder-alerts">
          <span className="subtle">Turn on alerts to get a notification when a reminder is due.</span>
          <button className="text-btn blue" type="button" onClick={turnOnAlerts}>
            <Icon d={ICON.bell} size={18} /> Turn on alerts
          </button>
          {alertsMsg && <span className="subtle" role="alert">{alertsMsg}</span>}
        </div>
      )}

      <form className="reminder-form" onSubmit={submit}>
        <input
          className="reminder-input"
          placeholder="Remind me to..."
          aria-label="Reminder"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          className="reminder-input"
          type="datetime-local"
          aria-label="Remind me at"
          min={toDateTimeLocal(nowMs)}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <button className="text-btn blue" type="submit" disabled={!ready || saving}>
          <Icon d={ICON.plus} size={20} /> {saving ? 'Adding...' : 'Add reminder'}
        </button>
      </form>

      {message && <div className="subtle" role="alert">{message}</div>}

      {!ready && <div className="subtle">Loading reminders...</div>}

      {ready && reminders.length === 0 && (
        <div className="subtle reminder-empty">No reminders yet.</div>
      )}

      {due.length > 0 && (
        <ReminderGroup
          label="Due"
          items={due}
          nowMs={nowMs}
          onRemove={removeReminder}
        />
      )}
      {upcoming.length > 0 && (
        <ReminderGroup
          label="Upcoming"
          items={upcoming}
          nowMs={nowMs}
          onRemove={removeReminder}
        />
      )}
    </section>
  )
}

function ReminderGroup({
  label,
  items,
  nowMs,
  onRemove,
}: {
  label: string
  items: Reminder[]
  nowMs: number
  onRemove: (id: string) => void
}) {
  return (
    <div className="reminder-group">
      <div className="reminder-group-label">{label}</div>
      <ul className="reminder-list">
        {items.map((r) => {
          const isDue = r.remindAt <= nowMs
          return (
            <li key={r.id} className={`reminder-row ${isDue ? 'due' : ''}`}>
              <div className="reminder-info">
                <span className="reminder-text">{r.text}</span>
                <span className="reminder-time">
                  {formatTime(r.remindAt)} · {formatRelative(r.remindAt, nowMs)}
                </span>
              </div>
              <button
                className="icon-btn pink"
                onClick={() => onRemove(r.id)}
                aria-label={isDue ? `Dismiss reminder: ${r.text}` : `Delete reminder: ${r.text}`}
              >
                <Icon d={isDue ? ICON.exit : ICON.trash} size={18} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
