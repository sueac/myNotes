import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { htmlToText, preview } from './lib/html.ts'
import {pad, formatTime} from './lib/format.ts'
import type { Note, NotePatch } from './types'
import { useNotes } from './hooks/useNotes.ts'
import {useSession} from './hooks/useSession.ts'
import {Icon, ICON} from './components/Icon.tsx'
import { NoteBody } from './components/NoteBody.tsx'
import { SideNote } from './components/SideNote.tsx'
import './Notes.css'


function SignIn() {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="app">
      <section className="widget">
        <div className="now-title">Notes</div>
        <div className="subtle">Sign in to sync your notes across devices.</div>
        {message && <div className="subtle">{message}</div>}
        <footer className="actions">
          <button className="text-btn blue" onClick={signIn} disabled={busy}>
            Sign in with Google
          </button>
        </footer>
      </section>
    </main>
  )
}

const WIDGET_DEFAULT = 400
const WIDGET_MIN = 300
const SIDESPACE_MIN = 200

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
    const width = Math.min(Math.max(e.clientX - ws.left, WIDGET_MIN), ws.width - SIDESPACE_MIN)
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
