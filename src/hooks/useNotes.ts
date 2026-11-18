import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Note, NoteRow } from '../types.ts'



const fromRow = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  body: r.body,
  updated: Number(r.updated),
})

// Loads this user's notes from Supabase and uploads changes shortly after each edit.
export function useNotes(userId: string) {
  const [notes, setNotes] = useState<Note[]>([])
  const [ready, setReady] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  // The last version of each note known to be saved in Supabase.
  const saved = useRef(new Map<string, Note>())

  useEffect(() => {
    let cancelled = false
    supabase
      .from('notes')
      .select('id, title, body, updated')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setSyncError(`Couldn't load notes: ${error.message}`)
        } else {
          const loaded = ((data ?? []) as NoteRow[]).map(fromRow)
          loaded.forEach((n) => saved.current.set(n.id, n))
          setNotes(loaded)
        }
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Notes are immutable, so any note whose object differs from the saved copy has changed.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(async () => {
      const changed = notes.filter((n) => saved.current.get(n.id) !== n)
      if (changed.length === 0) return
      const { error } = await supabase
        .from('notes')
        .upsert(changed.map((n) => ({ ...n, user_id: userId })))
      if (error) {
        setSyncError(`Couldn't save: ${error.message}`)
      } else {
        changed.forEach((n) => saved.current.set(n.id, n))
        setSyncError(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [notes, ready, userId])

  async function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    saved.current.delete(id)
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) setSyncError(`Couldn't delete: ${error.message}`)
  }

  return { notes, setNotes, ready, syncError, removeNote }
}