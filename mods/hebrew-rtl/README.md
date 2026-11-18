# hebrew-rtl

Hebrew right to left in Claude Code sessions of the Claude desktop app, on the computer and on the phone.

## What it changes

| Where you read the conversation | What the mod does |
| --- | --- |
| Claude desktop app, Code tab | Draws replies right to left: paragraphs, headings, bullets, numbered and nested lists, quotes, wrapped lines included. Tables read right to left. Code blocks stay left to right. Your own prompts and question dialogs read in the right order. |
| Claude phone app, for those same sessions | New replies are saved so that bullets, numbers, short lines and headings sit on the right. Seen on Android; not checked on iPhone. |

A reply is treated as Hebrew when at least 30% of its letters (code left out) are Hebrew.
Terminal sessions and headless runs are left alone.

## How it works

Two screens show the same conversation, and each needs its own fix.

1. **Desktop app.** It ignores `Text dir="rtl"` and continues a wrapped line flush left, but it
   draws what a mod hands it. So each line is drawn as one `Text` per word inside a
   `row-reverse` + `wrap` Box, each word wrapped in Unicode embedding marks
   (U+202B ... U+202C). Consecutive left-to-right words ("Claude Code") stay together as one
   item so they still read left to right. Code: `hooks/rtl.tsx`.
2. **Phone app.** It takes no drawing from a mod: it shows the saved reply with its own
   renderer, which already reads a Hebrew paragraph right to left but keeps list markers on the
   left and makes every block only as wide as its longest line, at the left of the screen.
   So just before a reply is saved, its text lines and list items are joined into one block of
   lines separated by hard breaks; each line opens with a right-to-left mark (U+200F), each list
   item carries its own bullet or number, and the block's last line and every heading end with
   60 em spaces (U+2003), which stretch the block to the full width without adding a line.
   The spaces are added only where they are needed: to a block whose longest line is under 60
   letters, and to a heading under 40 letters.
   Code: `hooks/native.tsx`. The desktop drawing reads this saved form back as ordinary lists.

## What to know

- Tokens: the desktop drawing runs on the computer and costs none. The phone fix adds invisible
  characters to the saved reply (one mark per line, and 60 spaces after a short block or
  heading), which the model reads again on later turns. The addition is small and was not
  measured exactly.

- The phone fix changes the saved text of new Hebrew replies, not only how they look. Text
  copied from a reply carries the invisible marks and the spaces at the end of a block.
- Replies saved before the mod was installed are not changed.
- The model reads its own earlier replies in the saved form.
- The app's own chrome is not open to mods: sidebar, menus, settings, the message box,
  the next-step box and the task list under a message.

## Where it is installed

- Folder: `~/.claude/maind-mods/mods/hebrew-rtl/`
- Plugin id: `hebrew-rtl@maind-mods`, user scope, so every session loads it.
- Turn off: `claude plugin disable hebrew-rtl@maind-mods`

## Checks

    claude plugin validate <this folder>
    claude plugin test <this folder>

A running session keeps the version it started with; open a new session to pick up a change.
