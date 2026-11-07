# Changes

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
