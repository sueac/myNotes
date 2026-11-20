import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { enableNotifications } from './lib/push'
import { htmlToText, preview } from './lib/html.ts'
import {pad, formatTime} from './lib/format.ts'
import type { Note, NotePatch } from './types'
import { useNotes } from './hooks/useNotes.ts'
import {useSession} from './hooks/useSession.ts'
import { Icon } from './components/Icon.tsx'
import { ICON } from './lib/icons.ts'
import { NoteBody } from './components/NoteBody.tsx'
import { SideNote } from './components/SideNote.tsx'
import { SignIn } from './components/SignIn.tsx'
import { Reminders } from './components/Reminders.tsx'
import './Notes.css'



const WIDGET_DEFAULT = 400
const WIDGET_MIN = 300
const SIDESPACE_MIN = 200
// Width of the reminders panel plus the space before it. Keep in sync with .reminders in Notes.css.
const REMINDERS_SPACE = 300 + 16

function NotesApp({ user }: { user: User }) {
  const userId = user.id
  const displayName = user.user_metadata.full_name ?? user.email ?? 'your account'
  const { notes, setNotes, ready, syncError, removeNote } = useNotes(userId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [widgetWidth, setWidgetWidth] = useState(WIDGET_DEFAULT)
  const [dropActive, setDropActive] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updated - a.updated),
    [notes],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((n) =>
      `${n.title} ${htmlToText(n.body)}`.toLowerCase().includes(q),
    )
  }, [sorted, query])

  const active = notes.find((n) => n.id === activeId) ?? null
  const activeIndex = active ? visible.findIndex((n) => n.id === active.id) : -1

  const pinnedNotes = pinnedIds.flatMap((id) => {
    const n = notes.find((x) => x.id === id)
    return n ? [n] : []
  })

  function updateNote(id: string, patch: NotePatch) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updated: Date.now() } : n)),
    )
  }

  function updateActive(patch: NotePatch) {
    if (active) updateNote(active.id, patch)
  }

  function pinNote(id: string) {
    setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function unpinNote(id: string) {
    setPinnedIds((prev) => prev.filter((p) => p !== id))
  }

  function dropNote(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDropActive(false)
    const id = e.dataTransfer.getData('text/plain')
    if (notes.some((n) => n.id === id)) pinNote(id)
  }

  // Dragging the splitter sets the main window's width.
  function resizeWidget(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const ws = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!ws) return
    // The reminders panel stacks under the sidespace on narrow screens, so only reserve room when it sits beside it.
    const reserved = window.matchMedia('(max-width: 1100px)').matches ? 0 : REMINDERS_SPACE
    const width = Math.min(
      Math.max(e.clientX - ws.left, WIDGET_MIN),
      ws.width - SIDESPACE_MIN - reserved,
    )
    setWidgetWidth(Math.round(width))
  }

  function createNote() {
    const note: Note = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      title: '',
      body: '',
      updated: Date.now(),
    }
    setNotes((prev) => [note, ...prev])
    setSearchOpen(false)
    setQuery('')
    setActiveId(note.id)
  }

  function deleteActive() {
    if (!active) return
    if (!window.confirm('Delete this note?')) return
    removeNote(active.id)
    setActiveId(null)
  }

  function step(direction: 1 | -1) {
    if (visible.length === 0) return
    const next =
      activeIndex === -1
        ? direction === 1
          ? 0
          : visible.length - 1
        : (activeIndex + direction + visible.length) % visible.length
    setActiveId(visible[next].id)
  }

  function toggleSearch() {
    setActiveId(null)
    setSearchOpen((open) => !open)
  }

  function exit() {
    setActiveId(null)
    setSearchOpen(false)
    setQuery('')
  }

  async function turnOnAlerts() {
    setPushMsg(null)
    try {
      await enableNotifications(userId)
      setPushMsg('Alerts are on for this browser.')
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : 'Could not turn on alerts')
    }
  }

  const showEditor = active !== null
  const showList = !showEditor

  return (
    <main className="app">
      <div className="workspace">
        <section className="widget" style={{ width: widgetWidth }}>
          <header className="clock">
            <div className="time">
              {pad(now.getHours())} {pad(now.getMinutes())}
            </div>
            <div className="date">
              {now.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <div className="subtle">Signed in as: {displayName}</div>
          </header>

          <nav className="player" aria-label="Note navigation">
            <button
              className="icon-btn purple"
              onClick={() => step(-1)}
              aria-label="Previous note"
            >
              <Icon d={ICON.prev} size={28} />
            </button>
            <button
              className="icon-btn purple"
              onClick={createNote}
              aria-label="New note"
              disabled={!ready}
            >
              <Icon d={ICON.plus} size={28} />
            </button>
            <button
              className="icon-btn purple"
              onClick={() => step(1)}
              aria-label="Next note"
            >
              <Icon d={ICON.next} size={28} />
            </button>
          </nav>
          <div className="now-title">{active ? active.title || 'Untitled' : 'Notes'}</div>
          <div className="subtle">
            {active ? `Edited ${formatTime(active.updated)}` : `${notes.length} notes`}
          </div>
          {syncError && <div className="subtle">{syncError}</div>}
          {pushMsg && <div className="subtle">{pushMsg}</div>}

          {showEditor && active && (
            <div className="editor">
              <input
                className="title-input"
                placeholder="Title"
                aria-label="Note title"
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
              />
              <NoteBody key={active.id} note={active} onChange={updateActive}>
                <button className="text-btn pink" onClick={deleteActive}>
                  <Icon d={ICON.trash} size={18} /> Delete
                </button>
              </NoteBody>
            </div>
          )}

          {showList && (
            <div className="list-wrap">
              {searchOpen && (
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search notes..."
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <ul className="list">
                {visible.length === 0 && (
                  <li className="empty subtle">
                    {!ready
                      ? 'Loading notes...'
                      : query
                        ? 'No matches'
                        : 'No notes yet. Tap + to add one.'}
                  </li>
                )}
                {visible.map((n) => (
                  <li
                    key={n.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', n.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <button className="note-row" onClick={() => setActiveId(n.id)}>
                      <span className="note-title">{n.title || 'Untitled'}</span>
                      <span className="note-preview">{preview(n.body)}</span>
                      <span className="note-time">{formatTime(n.updated)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <footer className="actions">
            {showList && (
              <>
                <button
                  className={`text-btn blue ${searchOpen ? 'on' : ''}`}
                  onClick={toggleSearch}
                >
                  <Icon d={ICON.search} size={20} /> Search
                </button>
                <button className="text-btn blue" onClick={turnOnAlerts}>
                  Enable alerts
                </button>
                <button className="text-btn" onClick={() => supabase.auth.signOut()}>
                  Sign out
                </button>
              </>
            )}
            {showEditor && (
              <button className="text-btn pink" onClick={exit}>
                <Icon d={ICON.exit} size={20} /> Exit
              </button>
            )}
          </footer>
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize main window"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={resizeWidget}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          onPointerCancel={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        />

        <aside
          className={`sidespace ${dropActive ? 'over' : ''}`}
          aria-label="Sidespace"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropActive(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false)
          }}
          onDrop={dropNote}
        >
          {pinnedNotes.length === 0 && (
            <div className="side-hint subtle">Drag a note here to keep it open beside your list.</div>
          )}
          {pinnedNotes.map((n) => (
            <SideNote
              key={n.id}
              note={n}
              onChange={(patch) => updateNote(n.id, patch)}
              onClose={() => unpinNote(n.id)}
            />
          ))}
        </aside>

        <Reminders userId={userId} now={now} />
      </div>
    </main>
  )
}

function Notes() {
  const session = useSession()

  if (session === undefined) {
    return (
      <main className="app">
        <section className="widget">
          <div className="subtle">Loading...</div>
        </section>
      </main>
    )
  }

  if (session === null) return <SignIn />

  return <NotesApp user={session.user} />
}

export default Notes
