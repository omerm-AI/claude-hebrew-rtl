# Install instructions, for Claude

You are Claude Code, running in the Claude desktop app on the user's Mac. The user asked you to
install the "hebrew-rtl" mod from this repository. Follow the steps below exactly, in order.

## How to talk to the user

- Answer in Hebrew only, in short plain sentences. The user is not a developer.
- Do not use arrows in Hebrew text. Use numbered steps.
- Before each command, say in one short Hebrew line what it does.

## Hard rules

- Do not skip, reorder or add steps.
- Do not write, rewrite, "improve" or fix any file of the mod. It is installed as it is, or not at all.
- Do not build your own version of this mod, and do not install any other plugin, package or tool.
- Do not use sudo. Do not ask for a password.
- Download only the one archive named in step 2, from github.com. Nothing else.
- If a step fails, STOP. Say in Hebrew which step failed and show the exact line that starts
  with "RESULT:". Do not try another way to install.
- Never say it is installed unless you saw the line "RESULT: OK" in this run.
- If a command is blocked by a sandbox or a permission rule, ask the user to allow it. Do not work around it.

## Step 1: check the computer

Run: `uname -s`

If the answer is not `Darwin`, stop and tell the user: this mod supports Mac only.

## Step 2: download the repository

Run exactly:

```bash
mkdir -p ~/Downloads/claude-hebrew-rtl && curl -fsSL https://github.com/omerm-AI/claude-hebrew-rtl/archive/refs/heads/main.zip -o ~/Downloads/claude-hebrew-rtl/repo.zip && unzip -o -q ~/Downloads/claude-hebrew-rtl/repo.zip -d ~/Downloads/claude-hebrew-rtl && ls ~/Downloads/claude-hebrew-rtl
```

The folder `~/Downloads/claude-hebrew-rtl/claude-hebrew-rtl-main` must now exist and hold a file
`install.sh`. From here on, KIT means the full path of that folder. If it does not exist, stop
and show the user the output.

## Step 3: read the install script

Read the file `KIT/install.sh` from start to end. Confirm to the user in one Hebrew sentence
that it only copies the mod into `~/.claude/maind-mods` and runs "claude plugin" commands. If it
does anything else, stop and say so.

## Step 4: install

Run: `bash "KIT/install.sh"`

Wait for it to finish (up to 2 minutes). Read the last line of its output.

## Step 5: read the result

If the last line is `RESULT: OK`, go to step 6.

If the last line is `RESULT: FAILED - <CODE>`, stop and tell the user in Hebrew what the code
means and what to do:

- `NOT_MAC`: the mod supports Mac only.
- `KIT_INCOMPLETE`: files are missing from the download. Run these instructions again.
- `NO_ENGINE`: the Claude desktop app was not found. Install or update the Claude desktop app,
  open its Code tab once, and run these instructions again.
- `APP_TOO_OLD`: the Claude desktop app is too old for this mod. Update the app (menu Claude,
  then Check for Updates), restart it, and run these instructions again.
- `OTHER_COPY_INSTALLED`: another copy of hebrew-rtl is already installed. Show its name from
  the output and ask whether to remove it. Only on a yes, run the engine's "plugin uninstall"
  for that exact name, then run step 4 again.
- `CANNOT_WRITE`: the script could not write to `~/.claude`. Show the output.
- Any other code (`VALIDATE_FAILED`, `TESTS_FAILED`, `SOURCE_NOT_ADDED`, `NOT_INSTALLED`,
  `NOT_ENABLED`, `FILES_DIFFER`): show the last 20 lines of the output and tell the user to send
  them to mAind.

## Step 6: tell the user what to do next

Tell the user, in Hebrew, exactly these points:

1. The install succeeded.
2. This conversation will NOT change. The change shows only in a new conversation.
3. What to do now: open a new conversation in the Code tab, write one sentence in Hebrew, and
   look at the answer.
4. What to expect on the computer: the answer is aligned to the right, bullets and numbers are
   on the right side, and a long sentence that breaks continues from the right. Code stays left
   to right, on purpose.
5. What to expect on the phone: in conversations that run on this Mac, new answers show bullets,
   numbers and headings on the right.
6. If the new conversation still shows Hebrew on the left: quit the Claude app completely, open
   it again, and try once more in a new conversation.

Then stop. Do nothing else.
