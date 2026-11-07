# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

Skill version 0.1.2, with the first run on 0.1.1 kept below. Claude Code run headless, model `claude-sonnet-5-5` as the
run's init event reports it, OpenFilm 0.2.7, Windows 11, 2026-11-06. Six runs, 35.8 minutes, $2.85. Each arm got its own
isolated project, and the skill folder was the one difference between arms.

One exception to the version: the agent without the skill on request 2 ran `npx -y openfilm@latest` throughout, as the
stub it was given says to, and that fetched OpenFilm 0.3.0. It read 0.3.0's manual and made its voice-over calls through
it. The other agent without the skill read that manual once and then used 0.2.7. The arms with the skill used only 0.2.7.

Results were read from contact sheets and frames, and no film was heard or watched in Studio. A native speaker has not
checked any translation.

## Material

The skill needs a voiced project as input, so both source projects were built for this trial, before the first run: plain
small films with pictures tied to words, on real subjects and unrelated to the skill. Each is the same input for both arms.
Their voice-over and word-timed `.vtt` files came from a local Kokoro voice service, which every arm could also use. It
speaks Chinese and English only, which is why these two directions were tried. No transcript was needed. The media stays
off this repository.

- Request 1, Dujiangyan, Chinese, 57.7 s, 9 lines, 15 pictures tied to words, facts from Chinese Wikipedia. Photos from
  Wikimedia Commons: `36665-Dujiangyan (30418293747).jpg` and `36676-Dujiangyan (31482768188).jpg` (xiquinhosilva, CC BY
  2.0), `都江堰鱼嘴.jpg` and `Dujiang Weir.jpg` (星星, CC BY-SA 4.0), `都江堰宝瓶口.jpg` (Jason, CC BY 2.0), `Li Bing Statue
  2.JPG` (Mutt, CC BY-SA 4.0), `Dujiangyan irrigation system, Sichuan, China.JPG` (CC BY-SA 3.0), `32302450
  DuJiangYan007.jpg` (public domain).
- Request 2, the Boston molasses flood, English, 50.5 s, 10 lines, 15 pictures tied to words, facts from English Wikipedia.
  From Wikimedia Commons, all public domain: `North End molasses tank.jpg`, `BostonMolassesDisaster.jpg`, `Boston 1919
  molasses disaster - el train structure.jpg`, `Boston post-January 16, 1919,.jpg`, `Boston molasses detail map.png`.

## Measures

[`measure.mjs`](measure.mjs) reads a finished project and a render of it, and takes the words from a cue sheet
([`cues-dujiangyan.json`](cues-dujiangyan.json), [`cues-molasses.json`](cues-molasses.json)):

- Furthest picture from its word, in frames at 30 fps, and how many of the 15 land within two frames. A clip's time comes
  from film.html. A moment inside a page comes from the first frame where the render changes. The word's time comes from
  the voice-over's word times, in the sense of the skill's brief.
- Each voice clip's `.vtt`: present, readable, as long as its sound, timed by word.
- Words of the original language left in pages, voice speed changes, voice overlaps, black frames, changes to the
  original project. Every film scored zero on all of these, reading clip speeds in film.html, so they are left out of the
  tables.

```sh
npx openfilm render --out film.mp4
node evals/measure.mjs <new project> evals/cues-molasses.json --mp4 film.mp4 --to zh --source <original> --original <original>
```

On the source films themselves (`--control`) the furthest is 1.8 and 1.4 frames, which is the measure's own floor.

Three limits. Word times are what each voice engine reports, and Kokoro's Chinese ones are spaced evenly per character.
Whisper large-v3 on the source films gave differences of up to 27.9 frames, too coarse to use. Two films had no usable
word times to read: for request 1 without the skill the engine's word list was taken from the agent's scratch folder, and
for request 2 without the skill they were asked for again from the voice service with the same lines, which returned
byte-identical sound. After the first runs, four word patterns in the cue sheets were corrected, for all arms alike:
`2000` also matched "two thousand years", `acres` missed "1.6 million", and two Chinese words matched their last
characters.

## Request 1

```
这个文件夹里是我做的都江堰短片，想发到 YouTube 给外国人看。帮我做个英文版。
```

| | with, 0.1.1 | with, 0.1.2 | without |
| --- | --- | --- | --- |
| furthest picture from its word | 8.2 frames | 5.3 frames | 6.6 frames |
| within two frames | 14 of 15 | 14 of 15 | 12 of 15 |
| `.vtt` beside the voice | 9 good | 9 good | none, an `.srt` instead |
| voice (the original's is female) | female, edge-tts | female, local Kokoro | male, edge-tts |
| length | 77.0 s | 63.3 s | 71.5 s |

On timing the arms are close. All three miss on a picture left at the start of "In 256 BC" or "In 2000" where the word is
the number. Seen: every card and the diagram are in English and fit in all three. Each translated the mu figure its own way:
0.1.1 and 0.1.2 say ten million mu and add hectares, and without says 1.6 million acres with mu on the card, and adds
"(67 ft)" to the width card. All three said so. The agents with the skill reported the furthest as 1 ms, against the
8.2 and 5.3 measured: they measured against words of their own choosing. They listed the Chinese text in the photos;
without did not, and it asked its voice engine for a rate of -4%, which slows the voice slightly.

## Request 2

```
This folder has my short film about the Boston molasses flood. A friend wants to post it on Bilibili for Chinese viewers. Can you make a Chinese version?
```

| | with, 0.1.1 | with, 0.1.2 | without |
| --- | --- | --- | --- |
| furthest picture from its word | 1.2 frames | 1.1 frames | 15.8 frames |
| within two frames | 15 of 15 | 15 of 15 | 9 of 15 |
| `.vtt` beside the voice | 10 timed by phrase | 10 good | 10 unreadable |
| voice (the original's is female) | female, Windows Huihui, spliced | male, local Kokoro | male, local Kokoro |
| length | 56.7 s | 58.3 s | 59.0 s |

Seen, without: the aftermath photo arrives 15.8 frames before 巨浪 and the 150 card 9.3 frames before its number, both
visible at the flagged frames. Its `.vtt` files were saved through a shell that broke the encoding, so each is garbled text
with a wrong length, and its report calls them word-timed. Its voice and cards add metric figures the original does not
have (约15米, 约56公里/时), and it said so.

Seen, with 0.1.1: the agent told the person the voice was a placeholder and not to post it. Its times are by phrase, so its
number counts the 12:30 card as on 下午, the start of the phrase. Seen, with 0.1.2: it reorders line 7 and says 中午 for
"afternoon", and names both. It leaves the English voice files in the new project's `assets/`, and says the newspaper has no
readable text, when the Boston Post headline is plainly readable in the frames. All three fit their cards, and all three
named the English in the map.

## The fix between versions

Version 0.1.1 sent the agent to `get voice` and `get tts`, which answer "not connected" when the person's voice service is
one of their own, though `get` lists it under `get call`. Both agents with the skill then went past the working local
service: one sent the script to an online voice, the other spliced a Windows voice phrase by phrase. Version 0.1.2 starts
from `get`, and on the same requests both used the local service with word-timed `.vtt` files.
