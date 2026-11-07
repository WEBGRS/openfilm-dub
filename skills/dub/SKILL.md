---
name: dub
description: Make a finished, voiced film in another language - the voice-over translated and spoken again, the words on screen and the subtitles in the new language, and every picture still landing on the word it was made for. Use when the person has a film with narration and asks for an English, Japanese or other-language version, a dubbed or localized version, or the same film for another market or platform (配音翻译, 多语种版本, 英文版, 日语版, 出海, 本地化).
---

# Another language

Make the version a native speaker of the new language would take for the original: their language heard, read and
timed as naturally as in the first, saying what the first one says.

## What defines it

Every word a viewer hears or reads is in the new language, and every picture still lands on the words it was made
for. Translated subtitles over the original voice are not this; neither is a new voice over pictures that now arrive
before or after what they show.

## What has to be true

- **The same film, said again.** Each line keeps its meaning, facts, numbers and names (a brand or a person's name
  stays as they spell it); nothing is added to fill time or dropped to save it. Where a line has to change to work in
  the new language (a pun, a rhyme, a local example), say which and why.
- **Written for the ear of that language**, at the length and rhythm a native script would have, in a voice like the
  original's. Where a line needs more time, the pictures make room for it; the voice is never sped up to fit.
- **Every picture on its word.** A number, a key word, a cut or a move tied to a word lands on that word in the new
  voice, within two frames, by the new voice-over's word times. Report the furthest one.
- **Text in the picture is in the new language too**, in pages and titles, and fits: nothing cut off, overflowing or
  covering something else, checked in the frames. Text inside footage or screenshots that cannot change is listed.
- **The original stays as it was**: the new language is a project of its own.

## What you have

The original project: film.html, its pages, and each voice-over line with its `.vtt` word times beside it. The
translation is yours. `npx openfilm get` says which voice services work, the person's own among them (`get call`). On a
connected one, `get voice --language <code>` finds voices and `get tts` speaks a line and returns its word times, from
which Studio makes the subtitles. A copy of the project's folder (Studio's "Save as new
project", or a copy opened with `npx openfilm open <folder>`) is the new language's project. Pictures are retimed by
moving and trimming clips and by a page's own times; `look` checks them. Before voicing every line on a paid service,
say how many lines and characters that is.

## With the person

What they ask for comes first. Which language and for whom (a market, a platform), who will check the translation if
they cannot read it, and the words that must stay as they are (product names, a slogan). Ask without holding up the
work. When done, tell them in a few lines what was made, how much longer or shorter it runs, the furthest picture
from its word, the lines that changed in meaning and why, and what a native speaker should check.
