import { useEffect, useMemo, useState } from 'react'
import './Notes.css'

type Note = {
  id: string
  title: string
  body: string
  updated: number
}

const STORAGE_KEY = 'sticky-notes:v1'

const seedNotes: Note[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    body: 'Tap + to start a new note.\n\nNotes are saved in this browser.',
    updated: Date.now(),
  },
]

function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false
  const n = value as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.body === 'string' &&
    typeof n.updated === 'number'
  )
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(isNote)
    }
  } catch {
    // Storage unavailable or corrupt: fall back to the seed note.
  }
  return seedNotes
}

function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Quota exceeded or storage blocked: the app keeps working in memory.
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const preview = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 60) || 'No text'
const formatTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Icon paths (24x24 grid, stroked)
const ICON = {
  prev: 'M19 5L7 12l12 7z',
  next: 'M5 5l12 7-12 7z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4',
  exit: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
} as const

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

function Notes() {
  const [notes, setNotes] = useState<Note[]>(loadNotes)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    saveNotes(notes)
  }, [notes])

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updated - a.updated),
    [notes],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q))
  }, [sorted, query])

  const active = notes.find((n) => n.id === activeId) ?? null
  const activeIndex = active ? visible.findIndex((n) => n.id === active.id) : -1

  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  )

  function updateActive(patch: Partial<Pick<Note, 'title' | 'body'>>) {
    if (!active) return
    setNotes((prev) =>
      prev.map((n) => (n.id === active.id ? { ...n, ...patch, updated: Date.now() } : n)),
    )
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
    setNotes((prev) => prev.filter((n) => n.id !== active.id))
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
      <section className="widget">
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
          <div className="subtle">{dayOfYear} days into the year</div>
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

        {showEditor && active && (
          <div className="editor">
            <input
              className="title-input"
              placeholder="Title"
              value={active.title}
              onChange={(e) => updateActive({ title: e.target.value })}
            />
            <textarea
              placeholder="Start writing..."
              value={active.body}
              onChange={(e) => updateActive({ body: e.target.value })}
            />
            <div className="editor-foot">
              <span className="subtle">{wordCount(active.body)} words</span>
              <button className="text-btn pink" onClick={deleteActive}>
                <Icon d={ICON.trash} size={18} /> Delete
              </button>
            </div>
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
                  {query ? 'No matches' : 'No notes yet. Tap + to add one.'}
                </li>
              )}
              {visible.map((n) => (
                <li key={n.id}>
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
          {showList && <button
            className={`text-btn blue ${searchOpen ? 'on' : ''}`}
            onClick={toggleSearch}
          >
            <Icon d={ICON.search} size={20} /> Search
          </button>}
          {showEditor && <button className="text-btn pink" onClick={exit}>
            <Icon d={ICON.exit} size={20} /> Exit
          </button>}
        </footer>
      </section>
    </main>
  )
}

export default Notes
