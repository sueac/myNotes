import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode} from 'react'
import { sanitizeHtml, toEditorHtml } from '../lib/html.ts'
import {readImage} from '../lib/images.ts'

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

export function RichEditor({ body, onChange }: { body: string; onChange: (html: string) => void }) {
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
