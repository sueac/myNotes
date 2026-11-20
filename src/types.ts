
export type Note = {
  id: string
  title: string
  body: string
  updated: number
}

export type NoteRow = Note & { user_id?: string }

export type NotePatch = Partial<Pick<Note, 'title' | 'body'>>

export type Reminder = {
  id: string
  text: string
  remindAt: number
}

export type ReminderRow = {
  id: string
  text: string
  remind_at: string
  user_id?: string
}
