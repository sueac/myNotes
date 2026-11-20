import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Reminder, ReminderRow } from '../types.ts'

const fromRow = (r: ReminderRow): Reminder => ({
  id: r.id,
  text: r.text,
  remindAt: Date.parse(r.remind_at),
})

// Loads this user's reminders. Adds and deletes are applied right away and undone if Supabase rejects them.
export function useReminders(userId: string) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [ready, setReady] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('reminders')
      .select('id, text, remind_at')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setSyncError(`Couldn't load reminders: ${error.message}`)
        } else {
          setReminders(((data ?? []) as ReminderRow[]).map(fromRow))
        }
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Returns true once the reminder is saved, so the form knows whether to clear itself.
  async function addReminder(text: string, remindAt: number) {
    const reminder: Reminder = { id: crypto.randomUUID(), text, remindAt }
    setReminders((prev) => [...prev, reminder])
    const { error } = await supabase.from('reminders').insert({
      id: reminder.id,
      user_id: userId,
      text,
      remind_at: new Date(remindAt).toISOString(),
    })
    if (error) {
      setReminders((prev) => prev.filter((r) => r.id !== reminder.id))
      setSyncError(`Couldn't save reminder: ${error.message}`)
      return false
    }
    setSyncError(null)
    return true
  }

  async function removeReminder(id: string) {
    const removed = reminders.find((r) => r.id === id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) {
      if (removed) setReminders((prev) => [...prev, removed])
      setSyncError(`Couldn't delete reminder: ${error.message}`)
    }
  }

  return { reminders, ready, syncError, addReminder, removeReminder }
}
