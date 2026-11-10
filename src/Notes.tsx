import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './Notes.css'

type Note = {
  id: string
  title: string
  body: string
  updated: number
}

type NoteRow = Note & { user_id?: string }

const fromRow = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  body: r.body,
  updated: Number(r.updated),
})

const MAX_IMAGE_PX = 1200

// Tags the editor may produce. Anything else is unwrapped (text kept) or removed.
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'SPAN', 'IMG',
])
const DROPPED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT',
])
const SAFE_IMAGE_SRC = /^data:image\/(png|jpeg|gif|webp);base64,/

// Keeps only formatting tags and safe embedded images, so stored HTML can't run scripts.
function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (parent: Element) => {
    for (const el of Array.from(parent.children)) {
      clean(el)
      if (DROPPED_TAGS.has(el.tagName)) {
        el.remove()
      } else if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes))
      } else if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') ?? ''
        if (!SAFE_IMAGE_SRC.test(src)) {
          el.remove()
        } else {
          for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
          el.setAttribute('src', src)
          el.setAttribute('style', 'max-width:100%;height:auto')
        }
      } else {
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
      }
    }
  }
  clean(doc.body)
  return doc.body.innerHTML
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Notes saved before rich text were plain text; show them as HTML with line breaks.
function toEditorHtml(body: string): string {
  if (/<\/?[a-z][\s\S]*>/i.test(body)) return body
  return escapeHtml(body).replace(/\n/g, '<br>')
}

function htmlToText(html: string): string {
  const spaced = html.replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
  return new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''
}

const pad = (n: number) => String(n).padStart(2, '0')
const wordCount = (html: string) => {
  const text = htmlToText(html).trim()
  return text ? text.split(/\s+/).length : 0
}
const preview = (html: string) =>
  htmlToText(html).replace(/\s+/g, ' ').trim().slice(0, 60) || 'No text'

// Scales a picked image down and returns it as a data URL, to keep notes small.
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_PX / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) {
        reject(new Error('Could not process that image'))
        return
      }
      // JPEG has no transparency, so paint a white background first.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}
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

// Tracks the signed-in user. undefined = still checking, null = signed out.
function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return session
}

// Loads this user's notes from Supabase and uploads changes shortly after each edit.
function useNotes(userId: string) {
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

const NO_FORMATS = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  insertUnorderedList: false,
}

function ToolButton({
  title,
  active = false,
  onAction,
  children,
}: {
  title: string
  active?: boolean
  onAction: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`rich-btn ${active ? 'on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      // Keep the text selection in the editor while the button is clicked.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAction}
    >
      {children}
    </button>
  )
}

function RichEditor({ body, onChange }: { body: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [initialHtml] = useState(() => sanitizeHtml(toEditorHtml(body)))
  const [formats, setFormats] = useState(NO_FORMATS)
  const [imageError, setImageError] = useState<string | null>(null)

  // Fill the editor once. After that the browser owns its contents, so re-renders don't move the cursor.
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml
  }, [initialHtml])

  // Remember the cursor position and show which formats apply at it.
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection()
      const editor = editorRef.current
      if (!sel || sel.rangeCount === 0 || !editor || !editor.contains(sel.anchorNode)) return
      savedRange.current = sel.getRangeAt(0).cloneRange()
      setFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  function focusEditor() {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
  }

  function emit() {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  function runCommand(cmd: string) {
    focusEditor()
    document.execCommand(cmd)
    emit()
  }

  async function insertImage(file: File) {
    setImageError(null)
    try {
      const src = await readImage(file)
      focusEditor()
      document.execCommand('insertHTML', false, `<img src="${src}" alt="">`)
      emit()
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not add image')
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Ctrl+T toggles strikethrough, as in Microsoft Sticky Notes.
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault()
      runCommand('strikeThrough')
    }
  }

  return (
    <div className="rich">
      <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
        <ToolButton title="Bold (Ctrl+B)" active={formats.bold} onAction={() => runCommand('bold')}>
          <b>B</b>
        </ToolButton>
        <ToolButton title="Italic (Ctrl+I)" active={formats.italic} onAction={() => runCommand('italic')}>
          <i>I</i>
        </ToolButton>
        <ToolButton title="Underline (Ctrl+U)" active={formats.underline} onAction={() => runCommand('underline')}>
          <u>U</u>
        </ToolButton>
        <ToolButton title="Strikethrough (Ctrl+T)" active={formats.strikeThrough} onAction={() => runCommand('strikeThrough')}>
          <s>S</s>
        </ToolButton>
        <ToolButton title="Bullets" active={formats.insertUnorderedList} onAction={() => runCommand('insertUnorderedList')}>
          • List
        </ToolButton>
        <ToolButton title="Insert image" onAction={() => fileRef.current?.click()}>
          Image
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) insertImage(file)
          }}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Note body"
        data-placeholder="Start writing..."
        spellCheck
        onInput={emit}
        onKeyDown={onKeyDown}
      />
      {imageError && <div className="subtle">{imageError}</div>}
    </div>
  )
}

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

type NotePatch = Partial<Pick<Note, 'title' | 'body'>>

// The body editor plus its word count. Used by the main editor and by side notes.
function NoteBody({
  note,
  onChange,
  children,
}: {
  note: Note
  onChange: (patch: NotePatch) => void
  children?: ReactNode
}) {
  return (
    <>
      <RichEditor body={note.body} onChange={(html) => onChange({ body: sanitizeHtml(html) })} />
      <div className="editor-foot">
        <span className="subtle">{wordCount(note.body)} words</span>
        {children}
      </div>
    </>
  )
}

// A note kept open in the sidespace, showing its full contents.
function SideNote({
  note,
  onChange,
  onClose,
}: {
  note: Note
  onChange: (patch: NotePatch) => void
  onClose: () => void
}) {
  return (
    <article className="side-note">
      <div className="side-head">
        <input
          className="title-input"
          placeholder="Title"
          aria-label="Note title"
          value={note.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button className="icon-btn purple" onClick={onClose} aria-label="Close note">
          <Icon d={ICON.exit} size={18} />
        </button>
      </div>
      <NoteBody note={note} onChange={onChange} />
    </article>
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
