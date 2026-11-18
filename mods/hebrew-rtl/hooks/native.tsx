// For a surface that shows the saved reply with its own renderer and takes no
// drawing from a mod (the phone app over Remote Control, seen 2026-11-18).
//
// What that renderer was seen to do:
//   - a Hebrew paragraph reads right to left by itself,
//   - a list keeps its bullet or number on the LEFT,
//   - every block (paragraph, list, heading) is only as wide as its longest
//     line and sits at the LEFT of the screen, so a block of short lines hugs
//     the left edge while a block with one long line fills the width and is
//     then right-aligned throughout.
//
// So the reply's markdown is rewritten before it is saved: consecutive text
// lines, list items and blank lines become ONE block of lines joined by hard
// breaks. Each line opens with a right-to-left mark, and a list item carries
// its own bullet or number. One long line anywhere in the block then pulls
// every short line (numbers included) to the right.
// Code fences, tables, rules and quotes are left as they are.

export const RLM = '‏' // a strong right-to-left character
const NBSP = ' '
const BREAK = '  ' // two trailing spaces: a hard line break in markdown
const ITEM = /^([ \t ]*)([-*+•☐☑]|\d+[.)])\s+(.*)$/

export type Options = {
  /** Headings become bold lines inside the block (they lose their size, and gain the alignment). */
  foldHeadings?: boolean
  /**
   * Invisible padding put after the last line of every block and after a kept
   * heading, to stretch a short block to the full width so it sits at the right.
   */
  pad?: string
  /**
   * Pad a block only when its longest line is shorter than this many letters:
   * a longer line already fills the screen, and the block with it. Absent, every block is padded.
   */
  padBodyBelow?: number
  /** The same for a heading, whose letters are larger. Absent, every heading is padded. */
  padHeadingBelow?: number
}

/** How many letters of a line show on screen: marks and markdown signs left out. */
export function shown(line: string): number {
  return line
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|~~|`/g, '')
    .trim().length
}

/** Padding an earlier pass may have left at a line's end: a long run of em or no-break spaces, then perhaps a mark. */
export const PAD_AT_END = /[\u2003\u00A0]{8,}\u200F?$/

function indentOf(s: string): number {
  const nb = (s.match(/ /g) ?? []).length
  if (nb) return Math.min(6, Math.round(nb / 4))
  return Math.min(6, Math.floor(s.replace(/\t/g, '    ').length / 2))
}

/** A line as written, without the marks an earlier pass of this function added. */
function bare(line: string): string {
  let s = line
  if (s.startsWith(RLM)) s = s.slice(RLM.length)
  s = s.replace(PAD_AT_END, '')
  if (s.endsWith(BREAK)) s = s.slice(0, -BREAK.length)
  return s
}

export function rtlMarkdown(text: string, options: Options = {}): string {
  const out: string[] = []
  const pad = options.pad ?? ''
  let run: string[] = [] // lines of the block being built; '' is a blank line
  const flush = () => {
    while (run.length && run[0] === '') run.shift()
    while (run.length && run[run.length - 1] === '') run.pop()
    if (run.length) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      const lines = run.map(l => (l === '' ? RLM + NBSP : RLM + l))
      const tail = Math.max(...run.map(shown)) < (options.padBodyBelow ?? Infinity) ? pad : ''
      out.push(...lines.map((l, i) => (i < lines.length - 1 ? l + BREAK : l + tail)))
      out.push('')
    }
    run = []
  }
  const opaque = (line: string) => {
    flush()
    out.push(line)
  }

  const lines = text.split('\n')
  let inFence = false
  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      if (!inFence) flush()
      inFence = !inFence
      out.push(raw)
      continue
    }
    if (inFence) {
      out.push(raw)
      continue
    }
    const line = bare(raw)
    if (line.trim() === '') {
      if (run.length) {
        if (run[run.length - 1] !== '') run.push('')
      } else if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    if (/^\s*\|/.test(line) || /^\s*>/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      opaque(line)
      continue
    }
    const head = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (head) {
      if (options.foldHeadings) run.push('**' + (head[2] ?? '') + '**')
      else opaque((head[1] ?? '#') + ' ' + (head[2] ?? '') + (shown(head[2] ?? '') < (options.padHeadingBelow ?? Infinity) ? pad : ''))
      continue
    }
    const m = line.match(ITEM)
    if (m) {
      let marker = /\d/.test(m[2] ?? '') ? (m[2] ?? '').replace(')', '.') : (m[2] ?? '•')
      if (/^[-*+]$/.test(marker)) marker = '•'
      let body = m[3] ?? ''
      const box = body.match(/^\[([ xX])\]\s+(.*)$/)
      if (box) {
        marker = box[1] === ' ' ? '☐' : '☑'
        body = box[2] ?? ''
      }
      run.push(NBSP.repeat(indentOf(m[1] ?? '') * 4) + marker + ' ' + body)
      continue
    }
    run.push(line.trim())
  }
  flush()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
