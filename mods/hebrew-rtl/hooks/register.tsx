import type { Register } from 'claude-code'

import { embed, embedLines, hasHebrew, isHebrewReply, renderLines, renderReply } from './rtl'
import { rtlMarkdown } from './native'

// hebrew-rtl 0.3.1: Hebrew right to left in Claude Code sessions of the Claude desktop app.
//
// Two mechanisms, because two kinds of screen show the same conversation:
//   1. The desktop app (Code tab) ignores `dir` but draws what a mod hands it,
//      so replies are laid out word by word, right to left (rtl.tsx).
//   2. The phone app shows the saved reply with its own renderer and takes no
//      drawing from a mod, so the reply's lists are rewritten as right-to-left
//      lines just before the reply is saved (native.tsx).
// Other surfaces (terminal, headless runs) are left alone.

// The surface the session started on; the save-time rewrite runs for the desktop app alone.
let startedOn: string | null = null
// True once this session has drawn on the desktop app or the phone app. A
// headless run or a terminal session never sets it, so their replies are
// saved as written.
let sawApp = false
// Invisible padding after a short block or a heading: 60 em spaces. On the
// phone it stretches the block to the full width, so the Hebrew sits at the
// right, and adds no line (seen on Android, 2026-11-18; a mark after the
// spaces, or no-break spaces, wrapped the line instead). It is added only to a
// block whose longest line is short: a long line fills the screen by itself.
const PAD = '\u2003'.repeat(60)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    startedOn = e.surface
    return next(e)
  })

  // The person's own prompts: marked so each line reads right to left.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface === 'desktop' || e.surface === 'mobile') sawApp = true
    if (e.surface !== 'desktop' || !hasHebrew(e.props.text)) return next(e)
    return next({ ...e, props: { ...e.props, text: embedLines(e.props.text) } })
  })

  // Replies are saved with their lists rewritten as right-to-left lines, so a
  // device that shows the saved reply with its own renderer (the phone app)
  // puts bullets and numbers on the right. Only in a session the desktop app
  // started, only the main conversation, only a reply that is mostly Hebrew.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const content = e.message.content
    if (!Array.isArray(content)) return next(e)
    let changed = false
    const out = content.map((b: any) => {
      if (!b || b.type !== 'text' || typeof b.text !== 'string') return b
      if (!(startedOn === 'desktop' || startedOn === 'mobile' || sawApp) || e.agentId || !isHebrewReply(b.text)) return b
      const text = rtlMarkdown(b.text, { pad: PAD, padBodyBelow: 60, padHeadingBelow: 40 })
      if (text === b.text) return b
      changed = true
      return { ...b, text }
    })
    if (!changed) return next(e)
    return next({ ...e, message: { ...e.message, content: out as typeof content } })
  }).catch(($, e, next) => next(e)) // if the rewrite ever fails, the reply is saved as written

  // Replies: Hebrew ones are drawn right to left, word by word.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface === 'desktop' || e.surface === 'mobile') sawApp = true
    // Only the desktop app: a terminal orders right-to-left text by itself.
    if (e.surface !== 'desktop' || !isHebrewReply(e.props.text)) return next(e)
    return renderReply($.ui.resolve(e), e.props.text)
  })

  // Questions: the card is the app's own. Its Hebrew strings are marked so they
  // read in the right order, and a right-aligned copy is drawn above the card.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const qs = e.props.questions as any[]
    if (e.surface !== 'desktop') return next(e)
    if (!Array.isArray(qs) || !qs.some(q => hasHebrew(JSON.stringify(q ?? '')))) return next(e)
    const mark = (s: unknown) => (typeof s === 'string' ? embed(s) : s)
    const questions = qs.map(q => ({
      ...q,
      question: mark(q?.question),
      options: Array.isArray(q?.options)
        ? q.options.map((o: any) => ({ ...o, label: mark(o?.label), description: mark(o?.description) }))
        : q?.options,
    }))
    const engine = await next({ ...e, props: { ...e.props, questions } })

    const lines: { text: string; bold?: boolean; dim?: boolean }[] = []
    const cost = (s: string) => 1 + Math.floor(s.length / 40)
    let rows = 0
    qs.forEach(q => {
      const text = String(q?.question ?? '')
      if (text) {
        lines.push({ text, bold: true })
        rows += cost(text)
      }
      const opts: any[] = Array.isArray(q?.options) ? q.options : []
      opts.forEach((o, j) => {
        const label = `${j + 1}. ${String(o?.label ?? '')}`
        const desc = o?.description ? ` – ${String(o.description)}` : ''
        lines.push({ text: label + desc })
        rows += cost(label + desc)
      })
    })
    // The frame above the card holds 48 rows; past that the card alone is drawn.
    if (rows > 40) return engine
    const ui = $.ui.resolve(e)
    const { Box } = ui
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" paddingBottom={1}>
          {renderLines(ui, lines)}
        </Box>
        {engine}
      </Box>
    )
  })
}
