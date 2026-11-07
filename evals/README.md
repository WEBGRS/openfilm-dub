# Evals

How this skill was tried. Nothing here goes to the agent: only `skills/` is installed.

On pictures landing on their words the skill was clearly better in all three requests. On the voice it was better in
request 2 only, and its films came out quieter than without it in requests 1 and 3 (a 7.6 and 4.5 LUFS gap) and level in
request 2. Request 3 (a caption track in the old language) was done end to end with the skill; the agent without it made
English subtitles and left the Chinese narration. The slowest run was a with-skill one (26 min, request 3).

Skill version 0.2.0. Claude Code run headless, model `claude-sonnet-5-5` as each run's init event reports it, OpenFilm
0.3.0, Windows 11, 2026-11-06. Seven runs, 79 minutes, $3.69. Each arm got its own isolated project, and the skill folder
was the one difference between arms. Every agent with the skill read it (its Skill call is in the log) and ran
`scripts/dub.mjs`: `voice` and `check` in requests 1 and 2, `voice`, `captions` and `check` in request 3.

Results were read from contact sheets and frames, and no film was heard or watched in Studio. A native speaker has not
checked any translation.

One run was repeated, as the rules allow after a defect showed: request 1 with the skill ran first on a `dub.mjs` that
had no note about a card with a number, and its card for "256 BC" landed 13.1 frames before "256". The note was added to
`check`, and request 1 ran once more (the second column). Requests 2 and 3 with the skill ran after the note was added.
No other file in `skills/` changed between runs.

## Material

The skill needs a voiced project as input, so the source projects were built before the first run: plain small films
with pictures tied to words, on real subjects and unrelated to the skill. Each is the same input for both arms. Their
voice-over and word-timed `.vtt` files (the transcripts, supplied beside each recording) came from a local Kokoro voice
service, which every arm could also use. It speaks Chinese and English only, which is why these two directions were
tried. The media stays off this repository.

- Request 1, Dujiangyan, Chinese, 57.7 s, 9 lines, 15 pictures tied to words, facts from Chinese Wikipedia. Photos from
  Wikimedia Commons: `36665-Dujiangyan (30418293747).jpg` and `36676-Dujiangyan (31482768188).jpg` (xiquinhosilva, CC BY
  2.0), `都江堰鱼嘴.jpg` and `Dujiang Weir.jpg` (星星, CC BY-SA 4.0), `都江堰宝瓶口.jpg` (Jason, CC BY 2.0), `Li Bing Statue
  2.JPG` (Mutt, CC BY-SA 4.0), `Dujiangyan irrigation system, Sichuan, China.JPG` (CC BY-SA 3.0), `32302450
  DuJiangYan007.jpg` (public domain).
- Request 2, the Boston molasses flood, English, 50.5 s, 10 lines, 15 pictures tied to words, facts from English
  Wikipedia. From Wikimedia Commons, all public domain: `North End molasses tank.jpg`, `BostonMolassesDisaster.jpg`,
  `Boston 1919 molasses disaster - el train structure.jpg`, `Boston post-January 16, 1919,.jpg`, `Boston molasses detail
  map.png`.
- Request 3 is request 1's project with a caption track added: Studio 0.3.0's own `syncSpeechCaptions` made it from the
  Chinese voice-over's `.vtt` (27 cues in Studio's default look, no `srclang`). Same photos and licences as request 1.

## Measures

[`measure.mjs`](measure.mjs) reads a finished project and a render of it, and takes the words from a cue sheet
([`cues-dujiangyan.json`](cues-dujiangyan.json), [`cues-molasses.json`](cues-molasses.json)). It is the same script on
every film, whichever arm made it:

- Furthest picture from its word, in frames at 30 fps, and how many of the 15 land within two frames. A clip's time
  comes from film.html. A moment inside a page comes from the first frame where the render changes. The word's time
  comes from the new voice-over's word times.
- Each voice clip's `.vtt`: present, readable, as long as its sound, timed by word.
- Caption tracks: how many, their language by script, how many cues start on a word of the voice.
- Words of the original language left in pages, voice speed changes, voice overlaps, black frames, changes to the
  original project. Every film scored zero on all of these, so they are left out of the tables.

[`voice-used.mjs`](voice-used.mjs) reads a run's log for the voice the agent asked the local service for, and the gender
the service labels it with. Voice level is the mix's integrated loudness from `openfilm look`.

```sh
npx openfilm render --out film.mp4
node evals/measure.mjs <new project> evals/cues-molasses.json --mp4 film.mp4 --to zh --source <original material> --original <original in the run>
node evals/voice-used.mjs <run.jsonl>
node skills/dub/scripts/dub.mjs check <new project> --from <original> --to zh --voice f
npm test
```

On the source films themselves (`--control`) the furthest is 1.8 and 1.4 frames, which is the measure's own floor.
Three limits. Word times are what the voice engine reports, and Kokoro's Chinese ones are spaced evenly per character.
After the first runs, four word patterns in the cue sheets were corrected, for all arms alike: `2000` also matched
"two thousand years", `acres` missed "1.6 million", and two Chinese words matched their last characters. In request 3 a
caption changing in the render counts as a change of the picture, so for that request the measure ignores the bottom
18% of the frame (`--caption-band 0.82`) in both arms; without it the four moments of the bar chart read as 17 to 356
frames off, because it was counting the captions changing. A moment inside a page is found from the render, so a page that
does not move at its word reads as late whatever the skill's `check` says: `check` reads clips, not pages.

## Request 1

```
这个文件夹里是我做的都江堰短片，想发到 YouTube 给外国人看。帮我做个英文版。
```

| | with, first run | with, second run | without |
| --- | --- | --- | --- |
| furthest picture from its word | 13.1 frames | 1.7 frames | 19.2 frames |
| within two frames | 14 of 15 | 15 of 15 | 11 of 15 |
| `.vtt` beside the voice | 9 good | 9 good | 9 good |
| voice (the original's is female) | female, `af_maple` | female, `af_maple` | female, `af_maple` |
| voice level (mix) | -26.3 LUFS | -26.3 LUFS | -18.7 LUFS |
| length of the render | 61.3 s | 60.8 s | 60.3 s |
| run | 9.2 min, $0.64 | 5.4 min, $0.52 | 13.9 min, $0.68 |

Seen: every card and the bar diagram are in English and fit in all three. The with-skill first run left the card for
"256 BC" on "In", 13.1 frames before "256"; its `check` printed 0.0 frames because the original's card had been on the
phrase and not on the number. The second run's `check` printed the note and the agent moved the card. Without has four
misses: the card for "256 BC" 3.0 frames early, and the cards for "10 million+ mu" and "2000" and the photo of the gate
16 to 19 frames before their numbers. Each translated the mu figure its own way. All three say mu in the voice; on the
card the first with-skill run adds acres and the other two hectares. All said so in their reports. Without also made an
`.srt` file and a render; the with-skill runs made neither.

## Request 2

```
This folder has my short film about the Boston molasses flood. A friend wants to post it on Bilibili for Chinese viewers. Can you make a Chinese version?
```

| | with | without | with, 0.1.2 (OpenFilm 0.2.7) |
| --- | --- | --- | --- |
| furthest picture from its word | 1.5 frames | 10.5 frames | 1.1 frames |
| within two frames | 15 of 15 | 7 of 15 | 15 of 15 |
| `.vtt` beside the voice | 10 good | 10 good | 10 good |
| voice (the original's is female) | female, `zf_001` | male, `zm_041` | male, `zm_041` |
| voice level (mix) | -21.9 LUFS | -22.9 LUFS | not measured |
| length of the render | 55.1 s | 58.8 s | 58.3 s |
| run | 9.8 min, $0.51 | 8.6 min, $0.39 | 7.5 min, $0.43 |

The last column is kept for the voice: the service's default Chinese voice is a male one, and the agent with 0.1.2 and
the agent without the skill both took it for a female original. With 0.2.0 the agent read the original's pitch (178 Hz),
asked for a female voice and said the service gives no age. Seen: all cards fit in Chinese in both arms. Both leave the
English on the map and the Boston Post front page, which are images, and both said so. `check` printed its note about a
card with a number for the tank page, which times its numbers inside the page; the with-skill agent left the page on its
line and timed those moments from the new word times, and all its page moments are within two frames. In the without
arm the tank graphic moves 5.4 and 6.1 frames ahead of its numbers and the injured count 10.5 frames ahead of its
number.

## Request 3

```
This folder has my short film about Dujiangyan, with Chinese subtitles on it. My friends abroad don't read Chinese. Can you make an English version?
```

Written for this trial, after requests 1 and 2 and before any run of it, on request 1's film with its caption track.

| | with | without |
| --- | --- | --- |
| furthest picture from its word | 1.0 frame | not measurable: the voice is still Chinese |
| within two frames | 15 of 15 | 3 of the 4 cues that find a word; 11 find none |
| caption track | English, 32 cues, all on a word of the new voice, Studio's look and note kept | English, 26 cues by the measure, timed as the Chinese ones |
| voice | `af_maple`, female, as the original | the original Chinese voice |
| voice level (mix) | -26.3 LUFS | -21.8 LUFS |
| length of the render | 60.4 s | 57.7 s |
| run | 26.4 min, $0.65 | 5.9 min, $0.31 |

Seen: with the skill the English captions are timed to the English voice and drawn in the track's own white outlined
look, which is hard to read over the pale bar diagram, as it was over the original's. Without the skill the agent
translated the subtitles and cards, left the narration in Chinese, said so and asked about a voice. That is what Studio
can already do for subtitles; the request asked for a version for people who do not read Chinese. The run with the skill
took four and a half times as long; part of it was the agent's own retiming script failing on a regular expression and
being written again.

## What changed between versions

Version 0.1.2 on request 2 used a male voice for a female original; 0.2.0 does not, and `check` fails a mismatch. Agents
with 0.1.2 reported the furthest picture as 1 ms where the measure found 5.3 frames; with 0.2.0 the number
comes from `check`, which printed 0.0 for the second request 1 run and for request 2, and the measure found 1.7 and 1.5
frames, inside its own floor of 1.4 to 1.8. A copy of
the project with a caption track was not tried before 0.2.0.

## Not tried

- A voice service with a voice library (`get voice --gender`): no key was connected; the trials used the local service,
  whose `GET /voices` labels each voice's gender.
- Any pair other than Chinese and English, and a Latin to Latin caption track, found only by identical text.
- A recorded human voice as the original: pitch was read on two spoken recordings from another trial (116 and 133 Hz,
  both read as male) and not checked by ear; the trial originals are synthetic.
- Matching age: the script does not measure it; the agents said the service gave none.
- Playing any film, a person pressing Make in Studio, and a native speaker's reading of any translation.
