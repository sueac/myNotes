import type {Note, NotePatch} from '../types'
import { NoteBody } from './NoteBody'
import { Icon, ICON } from './Icon'


// A note kept open in the sidespace, showing its full contents.
export function SideNote({
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