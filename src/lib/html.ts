
// Tags the editor may produce. Anything else is unwrapped (text kept) or removed.
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'UL', 'OL', 'LI', 'BR', 'DIV', 'P', 'SPAN', 'IMG',
])
const DROPPED_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT',
])
const SAFE_IMAGE_SRC = /^data:image\/(png|jpeg|gif|webp);base64,/

// Keeps only formatting tags and safe embedded images, so stored HTML can't run scripts.
export function sanitizeHtml(html: string): string {
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

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Notes saved before rich text were plain text; show them as HTML with line breaks.
export function toEditorHtml(body: string): string {
  if (/<\/?[a-z][\s\S]*>/i.test(body)) return body
  return escapeHtml(body).replace(/\n/g, '<br>')
}

export function htmlToText(html: string): string {
  const spaced = html.replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
  return new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''
}

export const wordCount = (html: string) => {
  const text = htmlToText(html).trim()
  return text ? text.split(/\s+/).length : 0
}
export const preview = (html: string) =>
  htmlToText(html).replace(/\s+/g, ' ').trim().slice(0, 60) || 'No text'
