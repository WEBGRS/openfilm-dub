# Changes

## 0.2.1

- `needs` names FFmpeg, which the script runs for audio that is not WAV (patch by riverisbuilding).
- Evals: the owner watched and listened to both arms.

## 0.2.0

A script, `scripts/dub.mjs`, with three commands the brief points to. The brief is 784 words.

- `voice` reads the original voice's pitch and says its gender. In the first trials a female original became a male
  Chinese voice: the voice service's default was taken and no run looked at the original's. `check` now asks for the new
  voice's gender as the voice list labels it (`--voice f|m|unknown`), and fails when it is not the original's, or when
  the label and the sound disagree widely. Pitch is a hint: a synthetic male voice can sit at 195 Hz and a synthetic
  female one at 150, so the person's word and the service's label come first, and the brief says so. Age is not
  measured: the brief asks for it to be matched, or said to be unmatched.
- `captions` writes a caption track still in the old language again from the new voice. OpenFilm 0.3.0 keeps words on
  the picture as caption tracks, and a copy of a project carried the old words and times over the new voice. The track
  keeps its STYLE, REGION and cue settings, gets cues of subtitle length from the new voice with each word timed, and
  keeps Studio's note of speech with the print Studio computes, so Studio still treats it as its own. A locked track is
  left alone and named. A Studio-made track has no `srclang`; the command adds it.
- `check` reads the copy against the original: voice files in the new language with a `.vtt` of timed words, no speed
  change, no overlap, no file of the old voice left in the project, the furthest picture from its word in frames
  (agents had reported 1 ms where 5.3 and 8.2 frames were measured), a picture that was on a number now on the number,
  caption tracks in the new language and on the new voice's words, and text of another script left in pages. It exits
  1 on a problem and prints last what to do. A card of a few words with a number in it that sits before the number is
  a note, since a page that times moments of its own belongs on its line.
- Tests in `test/` plant each fault in a small project and check that it is found and that a good copy passes.
- `needs` is unchanged; `details` says the voice matches the original's gender and that the caption track is translated.

## 0.1.2

OpenFilm 0.3.0 puts words on the picture as caption tracks: the brief says one already in the copy may still hold the
old language.

The brief no longer sends the agent only to `get voice` and `get tts`, which say "not connected" when the person's voice
service is one of their own. In the first trials two agents with the skill went past a working service that way. It
now starts from `get`, which lists the person's services and `get call`.

## 0.1.1

`needs` says what the skill needs beyond OpenFilm: a voice-over service with voices in the new language. Added
`evals/README.md` with the requests it was tried on, with and without it, and `evals/measure.mjs`, the measure used.

## 0.1.0

The first version: a brief for making a voiced film in another language.
