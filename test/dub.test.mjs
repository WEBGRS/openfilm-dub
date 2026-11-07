import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cuesPrint, cueWords, genderOf, inLanguage, isNumber, likeness, pitches, plainOf, readVtt, readWav, vttTime, voicePitch, writeVtt } from '../skills/dub/scripts/dub.mjs';
import { EN, ZH, project, tone } from './synth.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'skills', 'dub', 'scripts', 'dub.mjs');
const root = mkdtempSync(join(tmpdir(), 'dub-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
let n = 0;
const fresh = () => join(root, `p${n++}`);

// Studio 0.3.0's own file of two cues of speech, with its note
const STUDIO = 'WEBVTT\n\nNOTE Captions of what is said in the film, made again of it after cuts. 7fe44494\n\nREGION\nid:main\nwidth:100%\nlines:3\nregionanchor:50%,100%\nviewportanchor:50%,94%\n\nSTYLE\n::cue { color: #ffffff; }\n\nc1\n00:00:00.300 --> 00:00:01.800 region:main align:center\n<00:00:00.300>In <00:00:00.700>256 <00:00:01.200>BC,\n\nc2\n00:00:01.800 --> 00:00:03.000 region:main align:center\n<00:00:01.800>Li <00:00:02.100>Bing <00:00:02.500>began\n';

test('the print of a caption file made of speech is Studio 0.3.0\'s', () => {
  assert.equal(cuesPrint(readVtt(STUDIO).cues), '7fe44494');
});

test('a WebVTT file reads and writes back as it is, words timed', () => {
  const v = readVtt(STUDIO);
  assert.equal(writeVtt(v), STUDIO);
  assert.deepEqual(cueWords(v.cues[0]).map((k) => `${k.w}@${k.t}`), ['In@0.3', '256@0.7', 'BC,@1.2']);
  assert.equal(plainOf('<00:00:01.000>a &amp; <v X>b</v>'), 'a & b');
  assert.equal(vttTime(61.0004), '00:01:01.000');
});

test('pitch of voice-like tones: low reads male, high reads female', () => {
  for (const [hz, gender] of [[105, 'male'], [125, 'male'], [215, 'female'], [260, 'female']]) {
    const w = readWav(tone(hz, 4));
    const p = pitches(w.samples, w.rate);
    assert.ok(p.length > 20, `${hz}: voiced stretches ${p.length}`);
    const sorted = [...p].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    assert.ok(Math.abs(mid - hz) / hz < 0.05, `${hz} Hz read as ${mid}`);
    assert.equal(genderOf(mid), gender);
  }
  assert.equal(genderOf(160), 'unclear');
});

test('language by script, numbers, likeness', () => {
  assert.equal(inLanguage('公元前256年，蜀郡太守李冰', 'en'), false);
  assert.equal(inLanguage('In 256 BC, Li Bing began', 'en'), true);
  assert.equal(inLanguage('公元前256年，蜀郡太守李冰', 'zh-CN'), true);
  assert.equal(inLanguage('256', 'en'), null);
  assert.ok(isNumber('2000,') && isNumber('twenty') && isNumber('二') && !isNumber('In'));
  assert.ok(likeness('In 256 BC', 'in 256 bc!') > 0.95 && likeness('In 256 BC', '公元前256年') < 0.5);
});

/** The original (Chinese, female) and a good English copy of it. */
function pair(copy = {}) {
  const orig = fresh(), made = fresh();
  project(orig, { words: ZH, pitch: 220, card: 1.2, photo: 5.5 });
  project(made, { words: EN, pitch: 215, card: 0.8, photo: 5.7, ...copy });
  return { orig, made };
}
const check = (orig, made, ...more) => run('check', made, '--from', orig, '--to', 'en', '--voice', 'f', ...more);

test('a good copy passes and says what to put in the report', () => {
  const { orig, made } = pair();
  const r = check(orig, made);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Furthest picture from its word: 0\.0 frames; 2 of 2 within two frames/);
  assert.match(r.out, /no native speaker has checked the translation/);
});

test('without --voice the gender is asked for, and a male label on a female original fails', () => {
  const { orig, made } = pair();
  let r = run('check', made, '--from', orig, '--to', 'en');
  assert.equal(r.code, 1);
  assert.match(r.out, /Say what the voice list labels the new voice/);
  r = run('check', made, '--from', orig, '--to', 'en', '--voice', 'm');
  assert.equal(r.code, 1);
  assert.match(r.out, /original voice is female and the new one is labelled male/);
  r = run('check', made, '--from', orig, '--to', 'en', '--voice', 'm', '--original', 'm');
  assert.equal(r.code, 0, r.out);
});

test('a label that the sound contradicts is caught', () => {
  const { orig, made } = pair({ pitch: 105 });
  const r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /labelled female but measures/);
});

test('a picture off its word, and one on the words before its number', () => {
  const { orig, made } = pair({ photo: 5.7 + 8 / 30 });
  let r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /photo starts at .* 8\.0 frames after "Dujiangyan\."/);
  const again = pair({ card: 0.3 });
  r = check(again.orig, again.made);
  assert.equal(r.code, 1);
  assert.match(r.out, /card-num starts at 0\.30 s, 15\.0 frames before "256" at 0\.80 s \(it was on a number\)\. Move it to 0\.800/);
});

test('a voice sped up, a missing or garbled .vtt, and a leftover original voice are found', () => {
  let { orig, made } = pair({ speed: 1.2 });
  assert.match(check(orig, made).out, /runs at speed 1\.2/);
  ({ orig, made } = pair({ vtt: false }));
  assert.match(check(orig, made).out, /No \.vtt beside 2 voice files/);
  ({ orig, made } = pair());
  writeFileSync(join(made, 'assets', 'vo-1.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n��\n');
  assert.match(check(orig, made).out, /garbled/);
  ({ orig, made } = pair());
  cpSync(join(orig, 'assets', 'vo-1.wav'), join(made, 'assets', 'old-1.wav'));
  const r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /original's voice is still in the project, unused: assets\/old-1\.wav/);
});

test('text of another script left in a page is found', () => {
  const { orig, made } = pair({ page: '<!doctype html><html><body><div>公元前256年</div><script>window.film={frame(){}}</script></body></html>' });
  const r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /card\.html still has text in another script: 公元前/);
});

test('a caption track still in the old language is found, written again from the new voice, and then passes', () => {
  const zh = STUDIO.replace(/In /g, '公').replace('256 ', '256').replace('BC,', '年').replace('Li ', '李').replace('Bing ', '冰').replace('began', '始');
  const { orig, made } = pair({ captions: zh.replace(/NOTE [^\n]*/, `NOTE Captions of what is said in the film, made again of it after cuts. ${cuesPrint(readVtt(zh).cues)}`) });
  let r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /captions\/captions\.vtt still shows the original's language\. Run `captions <copy> --to en`/);

  r = run('captions', made, '--to', 'en');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /written again as \d+ cues from the new voice, look kept, still Studio's captions of speech/);
  const film = readFileSync(join(made, 'film.html'), 'utf8');
  assert.match(film, /<track kind="captions" src="captions\/captions\.vtt" label="Captions" srclang="en">/);
  const vtt = readVtt(readFileSync(join(made, 'captions', 'captions.vtt'), 'utf8'));
  assert.ok(vtt.styles[0].includes('#ffffff') && vtt.regions[0].includes('id:main'), 'look kept');
  assert.equal(vtt.cues[0].settings, 'region:main align:center');
  assert.ok(vtt.notes[0].endsWith(cuesPrint(vtt.cues)), 'the note carries the print of the new cues');
  // Cues on the film's clock: the first voice line starts at 0.3 s, the second at 4.3 s
  assert.equal(vtt.cues[0].start, 0.3);
  assert.ok(vtt.cues.some((c) => Math.abs(c.start - 4.3) < 1e-6));
  assert.match(vtt.cues.map((c) => plainOf(c.text)).join(' '), /In 256 BC, Li Bing began/);

  r = check(orig, made);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Caption tracks: 1/);
  const second = run('captions', made, '--to', 'en');
  assert.match(second.out, /already in en and on the new voice/);
});

test('a caption track in the new language but on the old film\'s times is found', () => {
  const late = 'WEBVTT\n\n00:00:02.000 --> 00:00:03.000\n<00:00:02.000>In <00:00:02.500>256 <00:00:03.000>BC\n';
  const { orig, made } = pair({ captions: late });
  const r = check(orig, made);
  assert.equal(r.code, 1);
  assert.match(r.out, /cues off the new voice's words: its times are the old film's/);
});

test('a locked caption track is left alone and said so', () => {
  const { orig, made } = pair({ captions: STUDIO.replace(/In|Li|Bing|began|BC/g, 'xx').replace(/256/g, '公元'), locked: true });
  const before = readFileSync(join(made, 'captions', 'captions.vtt'), 'utf8');
  const r = run('captions', made, '--to', 'en');
  assert.equal(r.code, 1);
  assert.match(r.out, /the track is locked/);
  assert.equal(readFileSync(join(made, 'captions', 'captions.vtt'), 'utf8'), before);
});

test('voice reads the original and says what to do', () => {
  const { orig } = pair();
  const r = run('voice', orig);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /The original voice: female/);
  assert.match(r.out, /get voice --language <code> --gender f/);
  assert.match(r.out, /Age is not measured/);
  const file = join(orig, 'assets', 'vo-1.wav');
  assert.ok(existsSync(file));
  assert.ok(voicePitch([file]).hz > 200);
});

test('commands without their arguments say how to use them', () => {
  assert.equal(run().code, 2);
  assert.equal(run('check', root).code, 2);
  assert.match(run('check', root, '--to', 'en').out, /has no film\.html/);
});

test('a card with a number that sits on the phrase before its number is noted, not failed', () => {
  const orig = fresh();
  project(orig, { words: ZH, pitch: 220, card: 0.3, photo: 5.5 });
  const late = fresh(), right = fresh();
  project(late, { words: EN, pitch: 215, card: 0.3, photo: 5.7 });
  project(right, { words: EN, pitch: 215, card: 0.8, photo: 5.7 });
  const r = check(orig, late);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /note: card-num is a card with a number and starts 15\.0 frames before "256" at 0\.800\. A card goes on its number/);
  assert.doesNotMatch(check(orig, right).out, /is a card with a number/);
});
