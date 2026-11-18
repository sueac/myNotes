
export type Note = {
  id: string
  title: string
  body: string
  updated: number
}

export type NoteRow = Note & { user_id?: string }

export type NotePatch = Partial<Pick<Note, 'title' | 'body'>>