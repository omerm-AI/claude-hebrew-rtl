// Right-to-left drawing for Hebrew text on a surface that lays text out left
// to right and ignores `dir`.
//
// What the desktop surface was seen to honour (lab, 2026-11-18):
//   - Unicode embedding marks inside a Text reorder its letters right to left.
//   - A `row-reverse` Box packs its children from the right edge.
//   - A wrapped Text continues flush LEFT, whatever the marks say.
// So a line is drawn as one Text per word in a `row-reverse` + `wrap` Box:
// the browser breaks the line between words and every row starts at the right.

export const RLE = '‫' // start a right-to-left embedding
export const LRE = '‪' // start a left-to-right embedding
export const PDF = '‬' // end the embedding
export const NBSP = ' '

const HEBREW = /[֐-׿יִ-ﭏ]/
const HEBREW_G = /[֐-׿יִ-ﭏ]/g
const LATIN = /[A-Za-zÀ-ɏ]/
const LATIN_G = /[A-Za-zÀ-ɏ]/g

export function hasHebrew(s: string): boolean {
  return HEBREW.test(s)
}

/** One line of text marked to read right to left, when it holds Hebrew. */
export function embed(s: string): string {
  return hasHebrew(s) && !s.startsWith(RLE) ? RLE + s + PDF : s
}

/** Every line of a text marked on its own, so each reads right to left. */
export function embedLines(s: string): string {
  return s.split('\n').map(embed).join('\n')
}

/** True when the prose of a reply (code left out) is Hebrew enough to draw right to left. */
export function isHebrewReply(text: string): boolean {
  const prose = text.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const he = (prose.match(HEBREW_G) ?? []).length
  if (he === 0) return false
  const la = (prose.match(LATIN_G) ?? []).length
  return he / (he + la) >= 0.3
}

// ---------------------------------------------------------------- inline

export type Frag = {
  t: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  href?: string
}

type Style = { bold?: boolean; italic?: boolean; strike?: boolean }

/** Inline markdown to styled fragments: bold, italic, strike, code, links. */
export function inline(src: string, st: Style = {}, out: Frag[] = []): Frag[] {
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: buf, ...st })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const c = src[i] ?? ''
    const rest = src.slice(i)
    if (c === '\\' && i + 1 < src.length && /[!-/:-@[-`{-~]/.test(src[i + 1] ?? '')) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const ticks = (rest.match(/^`+/) ?? ['`'])[0]
      const end = src.indexOf(ticks, i + ticks.length)
      if (end > 0) {
        flush()
        out.push({ t: src.slice(i + ticks.length, end).trim(), code: true })
        i = end + ticks.length
        continue
      }
    }
    const link = rest.match(/^!?\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
    if (link) {
      flush()
      const label = inline(link[1] ?? '').map(f => f.t).join('')
      out.push({ t: label, href: link[2] ?? '', ...st })
      i += link[0].length
      continue
    }
    const pair = (mark: string, key: keyof Style): boolean => {
      if (!rest.startsWith(mark)) return false
      const end = src.indexOf(mark, i + mark.length)
      if (end <= i + mark.length) return false
      const inner = src.slice(i + mark.length, end)
      if (/^\s|\s$/.test(inner) || inner.includes('\n')) return false
      flush()
      inline(inner, { ...st, [key]: true }, out)
      i = end + mark.length
      return true
    }
    if (pair('**', 'bold')) continue
    if (pair('~~', 'strike')) continue
    if (c === '*' && !rest.startsWith('**') && pair('*', 'italic')) continue
    buf += c
    i++
  }
  flush()
  return out
}

// ---------------------------------------------------------------- words

/** A run with no space in it (a code span or a link is one piece, spaces and all). */
export type Word = Frag[]

export function words(frags: Frag[]): Word[] {
  const out: Word[] = []
  let cur: Word = []
  const end = () => {
    if (cur.length) out.push(cur)
    cur = []
  }
  for (const f of frags) {
    if (f.code || f.href !== undefined) {
      cur.push(f)
      continue
    }
    const parts = f.t.split(/(\s+)/)
    for (const p of parts) {
      if (!p) continue
      if (/^\s+$/.test(p)) end()
      else cur.push({ ...f, t: p })
    }
  }
  end()
  return out
}

type Strong = 'R' | 'L' | null

function strongOf(f: Frag, fromEnd: boolean): Strong {
  if (f.code) return 'L'
  const s = f.t
  for (let k = 0; k < s.length; k++) {
    const ch = s[fromEnd ? s.length - 1 - k : k] ?? ''
    if (HEBREW.test(ch)) return 'R'
    if (LATIN.test(ch)) return 'L'
  }
  return null
}

function firstStrong(w: Word): Strong {
  for (const f of w) {
    const s = strongOf(f, false)
    if (s) return s
  }
  return null
}

function lastStrong(w: Word): Strong {
  for (let k = w.length - 1; k >= 0; k--) {
    const f = w[k]
    const s = f ? strongOf(f, true) : null
    if (s) return s
  }
  return null
}

/**
 * Words that must stay together: consecutive left-to-right words ("Claude
 * Code") read left to right as one piece inside a right-to-left line, so they
 * are one item; numbers and marks between two of them go along.
 */
export function group(ws: Word[]): Word[][] {
  const out: Word[][] = []
  let i = 0
  while (i < ws.length) {
    const first = ws[i]
    if (!first) break
    const g: Word[] = [first]
    let last = lastStrong(first)
    let j = i + 1
    while (last === 'L') {
      let k = j
      while (k < ws.length && firstStrong(ws[k] ?? []) === null) k++
      const next = ws[k]
      if (k >= ws.length || !next || firstStrong(next) !== 'L') break
      for (let m = j; m <= k; m++) g.push(ws[m] ?? [])
      last = lastStrong(next) ?? 'L'
      j = k + 1
    }
    out.push(g)
    i = j
  }
  return out
}

const OPEN = '([{'
const CLOSE = ')]}'

/**
 * A left-to-right piece split into what belongs to the Hebrew sentence around
 * it (an opening bracket before, sentence punctuation after) and its own core,
 * so "Claude." draws its full stop on the sentence's side.
 */
export function peel(text: string): { lead: string; core: string; trail: string } {
  let core = text
  let lead = ''
  let trail = ''
  const count = (s: string, set: string) => [...s].filter(ch => set.includes(ch)).length
  for (;;) {
    const ch = core[core.length - 1] ?? ''
    if (!ch || core.length <= 1) break
    if ('.,:;!?…'.includes(ch)) {
      trail = ch + trail
      core = core.slice(0, -1)
      continue
    }
    if (CLOSE.includes(ch) && count(core, CLOSE) > count(core, OPEN)) {
      trail = ch + trail
      core = core.slice(0, -1)
      continue
    }
    break
  }
  for (;;) {
    const ch = core[0] ?? ''
    if (!ch || core.length <= 1) break
    if (OPEN.includes(ch) && count(core, OPEN) > count(core, CLOSE)) {
      lead += ch
      core = core.slice(1)
      continue
    }
    break
  }
  return { lead, core, trail }
}

// ---------------------------------------------------------------- blocks

export type Block =
  | { kind: 'md'; text: string }
  | { kind: 'blank' }
  | { kind: 'para'; text: string; indent: number }
  | { kind: 'head'; text: string; level: number }
  | { kind: 'quote'; text: string }
  | { kind: 'item'; text: string; indent: number; marker: string }

function width(indent: string): number {
  return indent.replace(/\t/g, '    ').length
}

/** A table row with its Hebrew cells marked to read right to left. */
function markRow(line: string): string {
  if (/^\s*\|?\s*:?-{2,}/.test(line)) return line
  return line
    .split('|')
    .map(cell => (hasHebrew(cell) ? ` ${RLE}${cell.trim()}${PDF} ` : cell))
    .join('|')
}

export function blocks(text: string): Block[] {
  const out: Block[] = []
  const lines = text.split('\n')
  let i = 0
  let listIndent = -1
  while (i < lines.length) {
    // A reply saved by the rewrite for phones opens each line with a
    // right-to-left mark and ends it with a hard break: read through both.
    let line = lines[i] ?? ''
    if (line.startsWith('\u200F')) line = line.slice(1)
    line = line.replace(/[\u2003\u00A0]{8,}\u200F?$/, '') // padding for phones
    if (line.endsWith('  ')) line = line.slice(0, -2)
    const fence = line.match(/^\s*(```+|~~~+)/)
    if (fence) {
      const mark = (fence[1] ?? '```').slice(0, 3)
      const start = i
      i++
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(mark)) i++
      out.push({ kind: 'md', text: lines.slice(start, i + 1).join('\n').replace(/^[ \t]+(?=```|~~~)/gm, '') })
      i++
      continue
    }
    if (/^\s*\|/.test(line)) {
      const start = i
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) i++
      out.push({ kind: 'md', text: lines.slice(start, i).map(markRow).join('\n') })
      listIndent = -1
      continue
    }
    i++
    if (!line.trim()) {
      if (out.length && out[out.length - 1]?.kind !== 'blank') out.push({ kind: 'blank' })
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ kind: 'md', text: '---' })
      listIndent = -1
      continue
    }
    const head = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (head) {
      out.push({ kind: 'head', text: head[2] ?? '', level: (head[1] ?? '#').length })
      listIndent = -1
      continue
    }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      out.push({ kind: 'quote', text: (quote[1] ?? '').replace(/^(>\s?)+/, '') })
      continue
    }
    const item = line.match(/^(\s*)([-*+•☐☑]|\d+[.)])\s+(.*)$/)
    if (item) {
      const nb = ((item[1] ?? '').match(/\u00A0/g) ?? []).length
      const indent = nb ? Math.min(6, Math.round(nb / 4)) : Math.min(6, Math.floor(width(item[1] ?? '') / 2))
      const mark = item[2] ?? ''
      let marker = /\d/.test(mark) ? mark.replace(')', '.') : /[☐☑]/.test(mark) ? mark : '•'
      let body = item[3] ?? ''
      const box = body.match(/^\[([ xX])\]\s+(.*)$/)
      if (box) {
        marker = box[1] === ' ' ? '☐' : '☑'
        body = box[2] ?? ''
      }
      out.push({ kind: 'item', text: body, indent, marker })
      listIndent = indent
      continue
    }
    const lead = width((line.match(/^\s*/) ?? [''])[0])
    const indent = listIndent >= 0 && lead >= 2 ? listIndent + 1 : 0
    if (indent === 0) listIndent = -1
    out.push({ kind: 'para', text: line.trim(), indent })
  }
  while (out.length && out[out.length - 1]?.kind === 'blank') out.pop()
  return out
}

// ---------------------------------------------------------------- drawing

type Look = { bold?: boolean; dim?: boolean; size?: 'heading' }

function piece(ui: any, f: Frag, t: string, look: Look): any {
  const { Text } = ui
  if (f.code) return <Text mono>{LRE + t + PDF}</Text>
  if (!f.bold && !f.italic && !f.strike) return t
  return (
    <Text weight={f.bold || look.bold ? 'bold' : undefined} italic={f.italic} strikethrough={f.strike}>
      {t}
    </Text>
  )
}

/** One item of a line: a word, or left-to-right words kept together. */
function item(ui: any, g: Word[], look: Look, isLast: boolean): any {
  const { Text, Link } = ui
  const flat: Frag[] = []
  g.forEach((w, n) => {
    if (n > 0) flat.push({ t: ' ' })
    flat.push(...w)
  })
  const gap = isLast ? '' : NBSP
  const only = flat.length === 1 ? flat[0] : undefined
  if (only && only.href !== undefined) {
    return <Link href={only.href}>{RLE + only.t + gap + PDF}</Link>
  }
  const plain = flat.map(f => (f.code ? 'a' : f.t)).join('')
  const kids: any[] = []
  if (!hasHebrew(plain) && flat.some(f => f.code || LATIN.test(f.t))) {
    // Left to right inside the sentence: keep its own order, hand its edges back.
    const head = flat[0]
    const tail = flat[flat.length - 1]
    let lead = ''
    let trail = ''
    const core = flat.map(f => ({ ...f }))
    if (tail && !tail.code && core.length) {
      const p = peel(plain)
      const lastCore = core[core.length - 1]
      if (lastCore && p.trail && lastCore.t.endsWith(p.trail)) {
        trail = p.trail
        lastCore.t = lastCore.t.slice(0, -p.trail.length)
      }
    }
    if (head && !head.code && core.length) {
      const p = peel(plain)
      const firstCore = core[0]
      if (firstCore && p.lead && firstCore.t.startsWith(p.lead)) {
        lead = p.lead
        firstCore.t = firstCore.t.slice(p.lead.length)
      }
    }
    if (lead) kids.push(lead)
    kids.push(LRE)
    for (const f of core) if (f.t) kids.push(f.href !== undefined ? f.t : piece(ui, f, f.t, look))
    kids.push(PDF)
    if (trail) kids.push(trail)
  } else {
    for (const f of flat) if (f.t) kids.push(f.href !== undefined ? f.t : piece(ui, f, f.t, look))
  }
  return (
    <Text weight={look.bold ? 'bold' : undefined} dimColor={look.dim} size={look.size}>
      {RLE}
      {kids}
      {gap}
      {PDF}
    </Text>
  )
}

/** The items of one line, in reading order; the Box that holds them reverses the row. */
function flow(ui: any, text: string, look: Look): any[] {
  const gs = group(words(inline(text)))
  return gs.map((g, n) => item(ui, g, look, n === gs.length - 1))
}

/** A whole reply drawn right to left: paragraphs, headings, lists, quotes; code and tables as markdown. */
export function renderReply(ui: any, text: string): any {
  const { Box, Text, Markdown } = ui
  const rows = blocks(text).map(b => {
    if (b.kind === 'md') return <Markdown text={b.text} />
    if (b.kind === 'blank') return <Text> </Text>
    if (b.kind === 'head') {
      return (
        <Box flexDirection="row-reverse" flexWrap="wrap">
          {flow(ui, b.text, { bold: true, size: b.level <= 2 ? 'heading' : undefined })}
        </Box>
      )
    }
    if (b.kind === 'quote') {
      return (
        <Box flexDirection="row-reverse">
          <Text dimColor>{'▏' + NBSP}</Text>
          <Box flexGrow={1} flexShrink={1} flexDirection="row-reverse" flexWrap="wrap">
            {flow(ui, b.text, { dim: true })}
          </Box>
        </Box>
      )
    }
    if (b.kind === 'item') {
      return (
        <Box flexDirection="row-reverse" paddingRight={b.indent * 2}>
          <Text>{RLE + b.marker + NBSP + PDF}</Text>
          <Box flexGrow={1} flexShrink={1} flexDirection="row-reverse" flexWrap="wrap">
            {flow(ui, b.text, {})}
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="row-reverse" flexWrap="wrap" paddingRight={b.indent * 2}>
        {flow(ui, b.text, {})}
      </Box>
    )
  })
  return <Box flexDirection="column">{rows}</Box>
}

/** Short lines (a question, its options) drawn one Text each, pushed to the right edge. */
export function renderLines(ui: any, lines: { text: string; bold?: boolean; dim?: boolean }[]): any {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" alignItems="flex-end">
      {lines.map(l => (
        <Text weight={l.bold ? 'bold' : undefined} dimColor={l.dim}>
          {embed(l.text)}
        </Text>
      ))}
    </Box>
  )
}
