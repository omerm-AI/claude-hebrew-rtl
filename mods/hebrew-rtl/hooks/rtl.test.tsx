import { expect, test } from 'claude-code/testing'

import { RLM, rtlMarkdown } from './native'
import { RLE, PDF, blocks, embed, embedLines, group, inline, isHebrewReply, peel, words } from './rtl'

const plain = (g: ReturnType<typeof group>) => g.map(ws => ws.map(w => w.map(f => f.t).join('')).join(' '))

test('left-to-right words stay together, Hebrew words stand alone', async () => {
  expect(plain(group(words(inline('כמו Claude Code באמצע'))))).toEqual(['כמו', 'Claude Code', 'באמצע'])
  expect(plain(group(words(inline('ה-Claude Code עובד'))))).toEqual(['ה-Claude Code', 'עובד'])
  expect(plain(group(words(inline('Claude 5 Fable כאן'))))).toEqual(['Claude 5 Fable', 'כאן'])
})

test('numbers do not glue to each other or to Hebrew', async () => {
  expect(plain(group(words(inline('שלב 3 מתוך 5'))))).toEqual(['שלב', '3', 'מתוך', '5'])
  expect(plain(group(words(inline('1 2 3'))))).toEqual(['1', '2', '3'])
})

test('a code span is one left-to-right piece, spaces and all', async () => {
  expect(plain(group(words(inline('הרץ `npm test -- a` עכשיו'))))).toEqual(['הרץ', 'npm test -- a', 'עכשיו'])
})

test('sentence punctuation and unbalanced brackets are handed back to the sentence', async () => {
  expect(peel('Claude.')).toEqual({ lead: '', core: 'Claude', trail: '.' })
  expect(peel('hebrew-rtl,')).toEqual({ lead: '', core: 'hebrew-rtl', trail: ',' })
  expect(peel('(beta)')).toEqual({ lead: '', core: '(beta)', trail: '' })
  expect(peel('(Claude')).toEqual({ lead: '(', core: 'Claude', trail: '' })
  expect(peel('Code).')).toEqual({ lead: '', core: 'Code', trail: ').' })
  expect(peel('v0.2.0')).toEqual({ lead: '', core: 'v0.2.0', trail: '' })
})

test('marks are added once, per line, and only to Hebrew', async () => {
  expect(embed('שלום')).toBe(RLE + 'שלום' + PDF)
  expect(embed(embed('שלום'))).toBe(RLE + 'שלום' + PDF)
  expect(embed('hello')).toBe('hello')
  expect(embedLines('שלום\nhello')).toBe(RLE + 'שלום' + PDF + '\nhello')
})

test('inline markdown becomes styled pieces', async () => {
  const f = inline('רגיל **מודגש** ו-`code` ו-[קישור](https://example.com) ~~מחוק~~ *נטוי*')
  expect(f.find(x => x.bold)?.t).toBe('מודגש')
  expect(f.find(x => x.code)?.t).toBe('code')
  expect(f.find(x => x.href !== undefined)?.href).toBe('https://example.com')
  expect(f.find(x => x.strike)?.t).toBe('מחוק')
  expect(f.find(x => x.italic)?.t).toBe('נטוי')
  expect(inline('a * b * c').map(x => x.t).join('')).toBe('a * b * c')
  expect(inline('snake_case_name').map(x => x.t).join('')).toBe('snake_case_name')
})

test('a reply is split into headings, lists, quotes, code and tables', async () => {
  const b = blocks(
    ['## כותרת', '', '', 'פסקה', '- בולט', '  - מקונן', '3) ממוספר', '- [x] בוצע', '> ציטוט', '```bash', '- not a list', '```', '| א | b |', '|---|---|', '| ג | d |'].join('\n'),
  )
  expect(b.map(x => x.kind)).toEqual(['head', 'blank', 'para', 'item', 'item', 'item', 'item', 'quote', 'md', 'md'])
  expect(b[3]).toEqual({ kind: 'item', text: 'בולט', indent: 0, marker: '•' })
  expect(b[4]).toEqual({ kind: 'item', text: 'מקונן', indent: 1, marker: '•' })
  expect(b[5]).toEqual({ kind: 'item', text: 'ממוספר', indent: 0, marker: '3.' })
  expect(b[6]).toEqual({ kind: 'item', text: 'בוצע', indent: 0, marker: '☑' })
  expect((b[8] as { text: string }).text).toBe('```bash\n- not a list\n```')
  const table = (b[9] as { text: string }).text.split('\n')
  expect(table[0]).toBe(`| ${RLE}א${PDF} | b |`)
  expect(table[1]).toBe('|---|---|')
})

test('only a reply that is mostly Hebrew is drawn right to left', async () => {
  expect(isHebrewReply('Done. All tests pass.')).toBe(false)
  expect(isHebrewReply('בוצע. כל הבדיקות עוברות.')).toBe(true)
  expect(isHebrewReply('הרץ:\n```bash\nnpm install some-very-long-package-name --save-dev\n```')).toBe(true)
  expect(isHebrewReply('This long English explanation mentions the word שלום once and nothing more.')).toBe(false)
})

const REPLY = {
  plugin: 'hebrew-rtl',
  component: 'AssistantMessage',
  requestId: 'm1',
  props: { text: '', isFirstOfReply: true },
} as const

const SAMPLE = [
  '## כותרת עם Claude Code',
  'פסקה עם **מודגש**, `code`, [קישור](https://example.com) ומספר 45.',
  '- בולט ראשון.',
  '  - בולט מקונן.',
  '1. ממוספר (אופציונלי).',
  '> ציטוט.',
  '```bash',
  'npm test',
  '```',
  '| שלב | סטטוס |',
  '|---|---|',
  '| א | ב |',
].join('\n')

test('a Hebrew reply is drawn by the mod on desktop, as a tree the surface accepts', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...REPLY, props: { ...REPLY.props, text: SAMPLE }, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /בולט/ }))?.text).toContain(RLE)
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
  await ui.unmount()
})

test('an English reply, and any reply on the terminal, are left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const en = await $.ui.mount({ ...REPLY, props: { ...REPLY.props, text: 'All done.' }, surface: 'desktop' })
  expect((await en.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await en.unmount()
  const term = await $.ui.mount({ ...REPLY, requestId: 'm2', props: { ...REPLY.props, text: SAMPLE }, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await term.unmount()
})


const R = RLM
const NB = '\u00A0'

test('text, lists and blank lines become one block of right-to-left lines; code and tables are left alone', async () => {
  const out = rtlMarkdown(['## כותרת', '', 'פסקה', '**מודגש**', '- אחד', '  - מקונן', '', '2) שניים', '', '```', '- code', '```', '| - | a |', 'סוף'].join('\n'))
  expect(out.split('\n')).toEqual([
    '## כותרת',
    '',
    R + 'פסקה  ',
    R + '**מודגש**  ',
    R + '• אחד  ',
    R + NB.repeat(4) + '• מקונן  ',
    R + NB + '  ',
    R + '2. שניים',
    '',
    '```',
    '- code',
    '```',
    '| - | a |',
    '',
    R + 'סוף',
  ])
})

test('with folded headings a heading is a bold line inside the block', async () => {
  expect(rtlMarkdown('## כותרת\n\nפסקה', { foldHeadings: true }).split('\n')).toEqual([R + '**כותרת**  ', R + NB + '  ', R + 'פסקה'])
})

test('rewriting a reply twice changes nothing more', async () => {
  const src = ['## כותרת', '', 'פסקה', '- אחד', '  - מקונן', '1. שלב', '', '```', 'x', '```', 'סוף'].join('\n')
  for (const foldHeadings of [false, true]) {
    const once = rtlMarkdown(src, { foldHeadings })
    expect(rtlMarkdown(once, { foldHeadings })).toBe(once)
  }
})

test('the desktop drawing reads a rewritten reply as the same blocks', async () => {
  const src = ['פסקה', '- אחד', '  - מקונן', '- [x] בוצע', '1. שלב', '', 'סוף'].join('\n')
  expect(blocks(rtlMarkdown(src))).toEqual(blocks(src))
})

test('padding goes after the last line of a block and after a kept heading, and is not added twice', async () => {
  const pad = '\u2003'.repeat(60)
  const once = rtlMarkdown('## כותרת\n\nשורה\n- אחד', { pad })
  expect(once.split('\n')).toEqual(['## כותרת' + pad, '', R + 'שורה  ', R + '• אחד' + pad])
  expect(rtlMarkdown(once, { pad })).toBe(once)
  expect(blocks(once)).toEqual(blocks('## כותרת\n\nשורה\n- אחד'))
  const marked = '\u2003'.repeat(60) + R
  const twice = rtlMarkdown(rtlMarkdown('שורה\n- אחד', { pad: marked }), { pad: marked })
  expect(twice).toBe(rtlMarkdown('שורה\n- אחד', { pad: marked }))
})

test('only a block of short lines, and a short heading, are padded', async () => {
  const pad = '\u2003'.repeat(60)
  const long = 'שורה ארוכה מאוד שממלאת את כל רוחב המסך בטלפון ולכן הקטע שלה כבר מתוח לכל הרוחב בלי עזרה.'
  const o = { pad, padBodyBelow: 60, padHeadingBelow: 40 }
  expect(rtlMarkdown('- קצר\n- ' + long, o).endsWith(pad)).toBe(false)
  expect(rtlMarkdown('- קצר\n- עוד קצר', o).endsWith(pad)).toBe(true)
  expect(rtlMarkdown('## כותרת קצרה', o)).toBe('## כותרת קצרה' + pad)
  expect(rtlMarkdown('## ' + long, o)).toBe('## ' + long)
  const once = rtlMarkdown('## כותרת\n\n- קצר\n\n```\nx\n```\n' + long, o)
  expect(rtlMarkdown(once, o)).toBe(once)
})
