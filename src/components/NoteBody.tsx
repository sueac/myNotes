import type { ReactNode} from 'react'
import type {NotePatch, Note} from '../types'
import { RichEditor } from './RichEditor.tsx'
import { wordCount } from '../lib/html.ts'
import { sanitizeHtml } from '../lib/html.ts'


// The body editor plus its word count. Used by the main editor and by side notes.
export function NoteBody({
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
