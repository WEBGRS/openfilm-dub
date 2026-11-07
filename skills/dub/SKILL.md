---
name: dub
description: Make a finished, voiced film in another language - the voice-over translated and spoken again in a voice like the original's, the words on screen and the subtitles in the new language, every picture still on the word it was made for. Use when the person has a film with narration and wants an English, Japanese or other-language version, a dubbed or localized one, or the same film for another market or platform (配音翻译, 英文版, 日语版, 出海, 本地化).
---

# Another language

Make the version a native speaker of the new language would take for the original: heard, read and timed as
naturally as the first, saying what it says, in a voice like its own.

## What defines it

Every word a viewer hears or reads is in the new language, and every picture still lands on the words it was made
for. Translated subtitles over the original voice are not this; neither is a new voice over pictures that now arrive
before or after what they show.

## What has to be true

- **The same film, said again.** Each line keeps its meaning, facts, numbers and names (a brand or a person's name
  stays as they spell it); nothing is added to fill time or dropped to save it. Where a line has to change to work in
  the new language (a pun, a rhyme, a local example), say which and why.
- **Written for the ear of that language**, at the length a native script would have. Where a line needs more time,
  the pictures make room for it; the voice is never sped up to fit.
- **The same kind of voice**: the original speaker's gender and age, where the voice service has one in the new
  language. Where it has none, use the nearest and say so.
- **Every picture on its word.** A number, a key word, a cut or a move tied to a word lands on that word in the new
  voice, within two frames, by the new voice-over's word times. What was on a number goes on the number, not on the
  words before it. Report the furthest, as `check` prints it.
- **Everything the viewer reads is in the new language**: pages, titles and the film's caption tracks, which keep their
  look and are timed to the new voice. Text inside footage or screenshots that cannot change is listed. Nothing is cut
  off or covers something else, checked in the frames.
- **The original stays as it was**: the new language is a project of its own, holding no file of the old voice.

## What you have

The original project: film.html, its pages, each voice-over line with its `.vtt` word times, and perhaps a caption
track (`<track kind="captions">`, WebVTT on the film's time). The translation is yours. `npx openfilm get`
lists the voice services that work, the person's own among them (`get call`). On a connected one, `get voice --language
<code> --gender <m|f>` finds voices and `get tts` speaks a line and returns its word times. A copy of the project's
folder is the new language's project. Before voicing every line on a paid service, say how many lines and characters
that is.

`node <this skill's folder>/scripts/dub.mjs`, three commands, each printing what to do next:

- `voice <original>`, before choosing a voice: the original voice's gender, from its pitch. Pitch misreads some
  synthetic voices: the person's word, or the service's label, comes first.
- `captions <copy> --to <code>`, once the new voice is in: writes each caption track still in the old language again
  from the new voice, its look kept.
- `check <copy> --from <original> --to <code> --voice <f|m|unknown>`, before you say it is done, with the new voice's
  gender as the voice list labels it: voice files and word times, gender, every picture that sat on a word, caption
  tracks, text left in pages, files left behind. It exits 1 on a problem. It reads clips, not what happens inside a
  page: time those moments against their words yourself.

## With the person

What they ask for comes first. Which language and for whom (a market, a platform), who will check the translation if
they cannot read it, and the words that must stay as they are (product names, a slogan). Ask without holding up the
work. When done, tell them in a few lines what was made, how much longer or shorter it runs, how the voice matches the
original's gender and age, the furthest picture from its word, the lines that changed in meaning and why, and what a
native speaker should check: no native speaker has checked the translation, and you say so.
