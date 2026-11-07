#!/usr/bin/env node
// A film made again in another language: the original voice's gender, caption tracks, and the copy against the original.
//   dub.mjs voice <project | audio file>
//   dub.mjs captions <copy> --to <language>
//   dub.mjs check <copy> --from <original> --to <language>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FPS = 30;
const FRAME = 1 / FPS;
// What a text saved in the wrong encoding is full of
const REPLACEMENT = String.fromCharCode(0xfffd);
// Pitch (Hz) under which a voice reads as male and over which as female
const MALE_BELOW = 150, FEMALE_ABOVE = 170;

/* ── WebVTT ──────────────────────────────────────────────────────────── */

export const stamp = (s) => s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
export function vttTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
}
const ENTITIES = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'" };
const unescapeText = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => (
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? all));
export const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A cue's words without its tags and timestamps. */
export const plainOf = (text) => unescapeText(text.replace(/<[^>]*>/g, ''));

/** A WebVTT file as blocks: header, notes, regions, styles and cues. */
export function readVtt(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = { header: lines[0]?.startsWith('WEBVTT') ? lines[0] : 'WEBVTT', notes: [], regions: [], styles: [], cues: [] };
  let i = lines[0]?.startsWith('WEBVTT') ? 1 : 0;
  while (i < lines.length && lines[i].trim() !== '') i++;
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;
    const block = [];
    while (i < lines.length && lines[i].trim() !== '') block.push(lines[i++]);
    if (/^NOTE(\s|$)/.test(block[0])) { out.notes.push(block.join('\n')); continue; }
    if (/^STYLE(\s|$)/.test(block[0])) { out.styles.push(block.slice(1).join('\n')); continue; }
    if (/^REGION(\s|$)/.test(block[0])) { out.regions.push(block.slice(1).join('\n')); continue; }
    const at = block.findIndex((l) => l.includes('-->'));
    if (at < 0 || at > 1) continue;
    const [from, rest] = block[at].split('-->');
    const [to, ...settings] = rest.trim().split(/[ \t]+/);
    const start = stamp(from.trim()), end = stamp(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.cues.push({ id: at === 1 ? block[0].trim() : '', start, end, settings: settings.join(' '), text: block.slice(at + 1).join('\n') });
  }
  return out;
}

export function writeVtt(v) {
  const blocks = [v.header || 'WEBVTT', ...v.notes, ...v.regions.map((r) => `REGION\n${r}`),
    ...v.styles.filter((c) => c.trim()).map((c) => `STYLE\n${c.trim()}`),
    ...v.cues.map((c) => `${c.id ? `${c.id}\n` : ''}${vttTime(c.start)} --> ${vttTime(c.end)}${c.settings ? ` ${c.settings}` : ''}\n${c.text || ' '}`)];
  return `${blocks.join('\n\n')}\n`;
}

/** The words of a cue with the time each is said (the cue's start before the first timestamp). */
export function cueWords(cue) {
  const out = [];
  let t = cue.start;
  for (const part of cue.text.split(/(<\d[\d:.]*>)/)) {
    const m = /^<(\d[\d:.]*)>$/.exec(part);
    if (m) { t = stamp(m[1]); continue; }
    for (const w of plainOf(part).trim().split(/\s+/).filter(Boolean)) out.push({ t, w });
  }
  return out;
}

// Studio's print of a caption file made of speech: FNV-1a of each cue's words
export function cuesPrint(cues) {
  let h = 0x811c9dc5;
  for (const c of cues) {
    const line = `${plainOf(c.text)}\n`;
    for (let i = 0; i < line.length; i++) { h ^= line.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}
const SPEECH_NOTE = 'NOTE Captions of what is said in the film, made again of it after cuts.';
const speechNote = (cues) => `${SPEECH_NOTE} ${cuesPrint(cues)}`;

/* ── language ────────────────────────────────────────────────────────── */

const SCRIPTS = {
  han: /[㐀-鿿豈-﫿]/g, kana: /[぀-ヿ]/g, hangul: /[가-힯ᄀ-ᇿ]/g,
  cyrillic: /[Ѐ-ӿ]/g, arabic: /[؀-ۿ]/g, devanagari: /[ऀ-ॿ]/g, thai: /[฀-๿]/g,
  latin: /[A-Za-zÀ-ɏ]/g,
};
const WANTED = { zh: ['han'], ja: ['kana', 'han'], ko: ['hangul', 'han'], ru: ['cyrillic'], uk: ['cyrillic'], ar: ['arabic'], hi: ['devanagari'], th: ['thai'] };
export const primary = (lang) => String(lang ?? '').toLowerCase().split(/[-_]/)[0];
const scriptsFor = (lang) => WANTED[primary(lang)] ?? ['latin'];

/** Whether text is in the language, by its script: true, false, or null when it has too few letters to tell. */
export function inLanguage(text, lang) {
  const count = Object.fromEntries(Object.entries(SCRIPTS).map(([k, re]) => [k, (text.match(re) ?? []).length]));
  const all = Object.values(count).reduce((a, b) => a + b, 0);
  if (all < 3) return null;
  const mine = scriptsFor(lang).reduce((a, k) => a + count[k], 0);
  return mine / all >= 0.7;
}
/** Characters of a script other than the language's, listed. */
function foreignText(text, lang) {
  const keep = new Set(scriptsFor(lang));
  const found = [];
  for (const [k, re] of Object.entries(SCRIPTS)) if (!keep.has(k) && k !== 'latin') found.push(...(text.match(new RegExp(`${re.source}+`, 'g')) ?? []));
  return found;
}
const NUMBER_WORDS = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion'.split(' '));
/** Whether a word is a number: digits, a CJK numeral or an English number word. */
export const isNumber = (w) => /\d/.test(w) || /[零〇一二两三四五六七八九十百千万亿]/.test(w) || NUMBER_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''));
const selfName = (lang) => { try { return new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang; } catch { return lang; } };
const englishName = (lang) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang; } catch { return lang; } };
/** Two texts' likeness, 0 to 1: Dice on letter pairs. */
export function likeness(a, b) {
  const norm = (s) => [...s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')];
  const pairs = (c) => { const m = new Map(); for (let i = 0; i < c.length - 1; i++) { const k = c[i] + c[i + 1]; m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const x = norm(a), y = norm(b);
  if (x.length < 2 || y.length < 2) return x.join('') === y.join('') ? 1 : 0;
  const px = pairs(x), py = pairs(y);
  let hit = 0;
  for (const [k, n] of px) hit += Math.min(n, py.get(k) ?? 0);
  return (2 * hit) / (x.length - 1 + y.length - 1);
}

/* ── the project ─────────────────────────────────────────────────────── */

const attr = (tag, name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
const MUSIC = /(^|[\\/._ -])(music|bed|bgm|song|score|sfx|sound|ambien|whoosh|click)/i;

/** film.html's clips and caption tracks, track by track. */
export function readFilm(dir) {
  const html = readFileSync(join(dir, 'film.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const clips = [], tracks = [];
  let section = 0;
  for (const sec of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const flags = { hidden: /(?:^|\s)hidden(?:\s|=|$)/.test(sec[1]), locked: /(?:^|\s)locked(?:\s|=|$)/.test(sec[1]), muted: /(?:^|\s)muted(?:\s|=|$)/.test(sec[1]) };
    section++;
    for (const m of sec[2].matchAll(/<(iframe|img|video|audio|track)\b[^>]*>/g)) {
      const src = attr(m[0], 'src');
      if (!src) continue;
      if (m[1] === 'track') {
        tracks.push({ src: decodeURI(src), kind: attr(m[0], 'kind') ?? 'subtitles', srclang: attr(m[0], 'srclang'), label: attr(m[0], 'label'), ...flags, section });
        continue;
      }
      const [file, frag] = src.split('#t=');
      const [a, b] = (frag ?? '').split(',');
      const file1 = decodeURI(file);
      clips.push({
        tag: m[1], id: attr(m[0], 'id') ?? basename(file1), file: file1, in: a ? Number(a) : 0, out: b ? Number(b) : undefined,
        at: Number(attr(m[0], 'at') ?? 0), speed: Number(attr(m[0], 'speed') ?? 1), volume: Number(attr(m[0], 'volume') ?? 1),
        hidden: flags.hidden, silent: flags.muted || flags.hidden || /(?:^|\s)muted(?:\s|=|>|$)/.test(m[0]) || Number(attr(m[0], 'volume') ?? 1) === 0, section,
      });
    }
  }
  return { dir, clips, tracks };
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** The voice-over clips: audible sound clips not named for music or effects, each with its .vtt path. */
export function voiceClips(film) {
  return film.clips.filter((c) => c.tag === 'audio' && !c.silent && !MUSIC.test(c.file))
    .map((c) => ({ ...c, path: join(film.dir, c.file), vtt: join(film.dir, c.file.replace(/\.[^.]+$/, '.vtt')) }))
    .sort((a, b) => a.at - b.at);
}

/** A voice clip's seconds of sound, when it is a WAV file. */
function wavSeconds(path) {
  const w = existsSync(path) ? readWav(readFileSync(path)) : null;
  return w ? w.samples.length / w.rate : null;
}

/** Each word of the voice-over on the film's clock, from the .vtt beside each voice clip. */
export function filmWords(voices) {
  const words = [];
  for (const v of voices) {
    if (!existsSync(v.vtt)) continue;
    for (const cue of readVtt(readFileSync(v.vtt, 'utf8')).cues) {
      for (const k of cueWords(cue)) {
        if (k.t < v.in - 0.001 || (v.out !== undefined && k.t >= v.out)) continue;
        words.push({ t: v.at + (k.t - v.in) / v.speed, w: k.w, clip: v.id });
      }
    }
  }
  return words.sort((a, b) => a.t - b.t);
}

const isWide = (c) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(c);
// Width of a word in characters: a CJK character takes the room 2.6 Latin ones do (16 cells, 42 characters)
const widthOf = (w) => [...w].reduce((n, c) => n + (isWide(c) ? 2.6 : 1), 0);
/** Each voice line as cues on the film's clock, cut at sentences, clauses and the line length, a timestamp before each word. */
export function speechCues(voices, line = 42) {
  const out = [];
  for (const v of voices) {
    if (!existsSync(v.vtt)) continue;
    const at = (t) => v.at + (t - v.in) / v.speed;
    const limit = v.out !== undefined ? at(v.out) : Infinity;
    for (const cue of readVtt(readFileSync(v.vtt, 'utf8')).cues) {
      if (cue.start < v.in - 0.001 || (v.out !== undefined && cue.start >= v.out)) continue;
      const words = cueWords(cue).map((k) => ({ t: at(k.t), w: k.w, n: widthOf(k.w) }));
      if (!words.length) continue;
      const end = Math.min(at(cue.end), limit);
      const rest = words.map((_, i) => words.slice(i + 1).reduce((a, k) => a + k.n, 0));
      let chunks = [], cur = [], size = 0;
      words.forEach((k, i) => {
        const gap = cur.length && !isWide(cur.at(-1).w.at(-1)) && !isWide(k.w[0]) ? 1 : 0;
        if (cur.length && size + gap + k.n > line) { chunks.push(cur); cur = []; size = 0; }
        size += (cur.length && gap) + k.n;
        cur.push(k);
        const sentence = /[.!?。！？…]["')”’]?$/.test(k.w), clause = /[,;:，；：]$/.test(k.w) && size >= 10 && rest[i] >= 10;
        if (i < words.length - 1 && (sentence || clause)) { chunks.push(cur); cur = []; size = 0; }
      });
      if (cur.length) chunks.push(cur);
      // A last piece of one short word joins the one before it
      const width = (c) => c.reduce((a, k) => a + k.n + 1, 0);
      if (chunks.length > 1 && width(chunks.at(-1)) < 10 && width(chunks.at(-2)) + width(chunks.at(-1)) <= line + 8) chunks = [...chunks.slice(0, -2), [...chunks.at(-2), ...chunks.at(-1)]];
      chunks.forEach((c, i) => {
        const text = c.map((k, j) => `<${vttTime(k.t)}>${escapeText(k.w)}${j < c.length - 1 && !isWide(k.w.at(-1)) && !isWide(c[j + 1].w[0]) ? ' ' : ''}`).join('');
        out.push({ start: c[0].t, end: Math.max(c[0].t + FRAME, chunks[i + 1]?.[0].t ?? end), text });
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ── pitch ───────────────────────────────────────────────────────────── */

/** A WAV file's samples as mono floats; null when it is not one this reads (PCM 16, 24, 32 bit or float). */
export function readWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let p = 12, fmt = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4), body = p + 8;
    if (id === 'fmt ') fmt = { tag: buf.readUInt16LE(body), ch: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data' && fmt) {
      const bytes = fmt.bits / 8, n = Math.floor(Math.min(size, buf.length - body) / (bytes * fmt.ch));
      const float = fmt.tag === 3;
      if (![16, 24, 32].includes(fmt.bits) || (fmt.tag !== 1 && fmt.tag !== 3 && fmt.tag !== 0xfffe)) return null;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const o = body + (i * fmt.ch + c) * bytes;
          sum += float ? buf.readFloatLE(o) : fmt.bits === 16 ? buf.readInt16LE(o) / 32768 : fmt.bits === 24 ? buf.readIntLE(o, 3) / 8388608 : buf.readInt32LE(o) / 2147483648;
        }
        samples[i] = sum / fmt.ch;
      }
      return { rate: fmt.rate, samples };
    }
    p = body + size + (size & 1);
  }
  return null;
}

/** A sound file as mono 16 kHz floats: a WAV is read here, anything else through ffmpeg. */
function decode(path) {
  const w = readWav(readFileSync(path));
  if (w) return resample(w.samples, w.rate, 16000);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
}
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (i * from) / to, k = Math.floor(s), f = s - k;
    y[i] = x[k] * (1 - f) + (x[Math.min(k + 1, x.length - 1)] ?? 0) * f;
  }
  return y;
}

/** The pitch of each voiced stretch of speech sampled at 16 kHz, in Hz (autocorrelation, 40 ms windows). */
export function pitches(x, rate = 16000) {
  const N = Math.round(rate * 0.04), hop = Math.round(rate * 0.03);
  const lo = Math.floor(rate / 400), hi = Math.ceil(rate / 70);
  const frames = [];
  for (let s = 0; s + N + hi <= x.length; s += hop) {
    let mean = 0;
    for (let i = 0; i < N + hi; i++) mean += x[s + i];
    mean /= N + hi;
    let e = 0;
    for (let i = 0; i < N; i++) e += (x[s + i] - mean) ** 2;
    frames.push({ s, mean, rms: Math.sqrt(e / N) });
  }
  const sorted = frames.map((f) => f.rms).sort((a, b) => a - b);
  const gate = 0.2 * (sorted[Math.floor(sorted.length * 0.9)] ?? 0);
  const found = [];
  for (const f of frames) {
    if (f.rms <= gate || f.rms < 1e-4) continue;
    const r = new Float64Array(hi + 1);
    for (let lag = lo; lag <= hi; lag++) {
      let xy = 0, xx = 0, yy = 0;
      for (let i = 0; i < N; i++) {
        const a = x[f.s + i] - f.mean, b = x[f.s + i + lag] - f.mean;
        xy += a * b; xx += a * a; yy += b * b;
      }
      r[lag] = xy / (Math.sqrt(xx * yy) || 1);
    }
    let best = lo;
    for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[best]) best = lag;
    if (r[best] < 0.6) continue;
    // The shortest peak nearly as strong, so a pitch is not read an octave low
    let pick = best;
    for (let lag = lo + 1; lag < best; lag++) if (r[lag] >= 0.85 * r[best] && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { pick = lag; break; }
    found.push(rate / pick);
  }
  return found;
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** The gender a pitch says: 'male', 'female', or 'unclear' between the two. */
export const genderOf = (hz) => (hz === null ? null : hz < MALE_BELOW ? 'male' : hz > FEMALE_ABOVE ? 'female' : 'unclear');

/** The pitch of a set of sound files together: { hz, gender, frames, per: [{ file, hz }] }. */
export function voicePitch(paths) {
  const all = [], per = [];
  for (const path of paths) {
    const x = existsSync(path) ? decode(path) : null;
    const f = x ? pitches(x) : [];
    per.push({ file: path, hz: median(f), frames: f.length });
    all.push(...f);
  }
  const hz = all.length >= 20 ? median(all) : null;
  return { hz, gender: genderOf(hz), frames: all.length, per };
}

/* ── commands ────────────────────────────────────────────────────────── */

const out = (s = '') => console.log(s);
const rel = (dir, p) => relative(dir, p).replace(/\\/g, '/');
const sec = (n) => `${n.toFixed(2)} s`;

function cmdVoice(target) {
  const paths = statSync(target).isDirectory() ? voiceClips(readFilm(target)).map((v) => v.path) : [target];
  if (!paths.length) { out('No voice-over clips in film.html. Ask the person who speaks, and say the new voice is unmatched.'); return 1; }
  const v = voicePitch(paths);
  for (const p of v.per) out(`${basename(p.file).padEnd(24)} ${p.hz ? `${p.hz.toFixed(0)} Hz` : 'no clear pitch'}`);
  if (!v.gender) { out('The pitch could not be read. Ask the person who speaks in the original, and say so in your report.'); return 1; }
  out();
  out(`The original voice: ${v.gender} (median pitch ${v.hz.toFixed(0)} Hz over ${v.frames} voiced stretches).`);
  if (v.gender === 'unclear') out(`Between ${MALE_BELOW} and ${FEMALE_ABOVE} Hz pitch does not say. Ask the person who speaks; do not guess.`);
  else {
    out(`Voice the new language in a ${v.gender} voice: \`npx openfilm get voice --language <code> --gender ${v.gender === 'male' ? 'm' : 'f'}\`, or one of the person's own service that it lists as ${v.gender}.`);
    out('Age is not measured. Match what the person says, or what the voices describe; where no voice of this gender and age exists in the new language, say so in your report.');
  }
  return 0;
}

/** Sets srclang and label on the caption track of a src in film.html; returns whether it changed. */
export function setTrackLanguage(dir, src, lang, wasLang) {
  const path = join(dir, 'film.html');
  const html = readFileSync(path, 'utf8');
  let changed = false;
  const next = html.replace(/<track\b[^>]*>/g, (tag) => {
    if (decodeURI(attr(tag, 'src') ?? '') !== src) return tag;
    const set = (t, name, value) => (attr(t, name) !== undefined ? t.replace(new RegExp(`((?:^|\\s)${name}=")[^"]*"`), `$1${value}"`) : t.replace(/\s*\/?>$/, ` ${name}="${value}"$&`));
    let t = set(tag, 'srclang', lang);
    const label = attr(t, 'label');
    const old = [wasLang && selfName(primary(wasLang)), wasLang && englishName(primary(wasLang))].filter(Boolean);
    if (label === undefined || old.includes(label) || inLanguage(label, lang) === false) t = set(t, 'label', selfName(primary(lang)));
    changed = changed || t !== tag;
    return t;
  });
  if (changed) writeFileSync(path, next);
  return changed;
}

/** What one caption track holds, against what the copy's voice says. */
export function trackState(film, track, words, lang, originalTexts) {
  const file = join(film.dir, track.src);
  if (!existsSync(file)) return { missing: true };
  const vtt = readVtt(readFileSync(file, 'utf8'));
  const text = vtt.cues.map((c) => plainOf(c.text)).join(' ');
  const onWord = vtt.cues.filter((c) => words.some((w) => Math.abs(w.t - c.start) <= 2 * FRAME + 1e-6)).length;
  const spoken = (c) => words.filter((w) => w.t >= c.start - 0.3 && w.t < c.end + 0.1).map((w) => w.w).join(' ');
  const alike = vtt.cues.map((c) => likeness(plainOf(c.text), spoken(c)));
  const own = originalTexts.get(track.src);
  return {
    vtt, cues: vtt.cues.length, text,
    wrongLanguage: (track.srclang !== undefined && primary(track.srclang) !== primary(lang)) || inLanguage(text, lang) === false || (own !== undefined && own === text),
    onWord, speech: alike.length ? alike.reduce((a, b) => a + b, 0) / alike.length : 1, madeOfSpeech: vtt.notes.some((n) => n.startsWith(SPEECH_NOTE)),
  };
}

/** The caption track of the original, per src, as its words (to tell an old-language file by what it says). */
function originalCaptionTexts(dir) {
  const map = new Map();
  if (!dir || !existsSync(join(dir, 'film.html'))) return map;
  for (const t of readFilm(dir).tracks) {
    const p = join(dir, t.src);
    if (existsSync(p)) map.set(t.src, readVtt(readFileSync(p, 'utf8')).cues.map((c) => plainOf(c.text)).join(' '));
  }
  return map;
}

function cmdCaptions(copy, lang, from) {
  const film = readFilm(copy);
  const tracks = film.tracks.filter((t) => ['captions', 'subtitles'].includes(t.kind));
  if (!tracks.length) { out('No caption track in film.html: nothing to write again. Studio makes captions from the new voice when the person asks.'); return 0; }
  const voices = voiceClips(film);
  const words = filmWords(voices), cues = speechCues(voices);
  if (!cues.length) { out('The voice clips have no .vtt cues, so there is nothing to write the captions from. Save the new voice\'s .vtt beside each clip first.'); return 1; }
  const texts = originalCaptionTexts(from);
  let bad = 0;
  for (const t of tracks) {
    const st = trackState(film, t, words, lang, texts);
    if (st.missing) { out(`${t.src}: the file is not there.`); bad++; continue; }
    const stale = st.wrongLanguage || st.onWord < st.cues * 0.9;
    if (!stale) { out(`${t.src}: already in ${lang} and on the new voice (${st.cues} cues). Left as it is.`); continue; }
    if (t.locked) { out(`${t.src}: the track is locked (the person's). Not changed: tell them it still has ${t.srclang ?? 'the old language'}.`); bad++; continue; }
    const speech = st.madeOfSpeech;
    const first = st.vtt.cues[0];
    // Cues of the new voice with the look of the old: styles and regions as they are, a cue's own look dropped
    const made = cues.map((c, i) => ({ id: `c${i + 1}`, start: c.start, end: c.end, settings: first?.settings ?? '', text: c.text }));
    const notes = speech ? [speechNote(made)] : st.vtt.notes;
    const styles = st.vtt.styles.map((b) => b.replace(/::cue\(#[^)]*\)\s*\{[^}]*\}\s*/g, ''));
    writeFileSync(join(film.dir, t.src), writeVtt({ ...st.vtt, notes, styles, cues: made }));
    const changed = setTrackLanguage(film.dir, t.src, lang, t.srclang);
    out(`${t.src}: ${st.cues} cues in ${t.srclang ?? 'the old language'} written again as ${made.length} cues from the new voice, look kept${speech ? ', still Studio\'s captions of speech' : ''}.${changed ? ` film.html's track now says srclang="${lang}".` : ''}`);
  }
  out();
  out(bad ? 'Next: the tracks named above are not done; say so to the person. Then run `check`.' : 'Next: run `check`, then `look` at a frame with a caption on it.');
  return bad ? 1 : 0;
}

/** Pages' text outside the new language's script, and pages left as the original had them. */
function pageText(copy, from, lang) {
  const problems = [], notes = [];
  const pages = [...new Set(copy.clips.filter((c) => c.tag === 'iframe' && !/film\.html$/i.test(c.file)).map((c) => c.file))];
  for (const f of pages) {
    const p = join(copy.dir, f);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    const dom = html.replace(/<(script|style|title)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
    const js = [...html.matchAll(/<script\b[\s\S]*?<\/script>/g)].map((m) => m[0].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')).join(' ');
    const foreign = foreignText(dom + js, lang);
    if (foreign.length) problems.push(`${f} still has text in another script: ${[...new Set(foreign)].slice(0, 8).join(' ')}. Translate it.`);
    const orig = from && existsSync(join(from, f)) ? readFileSync(join(from, f), 'utf8') : null;
    if (orig === html && (dom.match(/\p{L}{3,}/gu) ?? []).length >= 2 && !foreign.length) notes.push(`${f} is the original's page, text unchanged: fine only if it is names or numbers.`);
  }
  const latinWords = !scriptsFor(lang).includes('latin');
  if (latinWords) for (const f of pages) {
    const p = join(copy.dir, f);
    if (!existsSync(p)) continue;
    const dom = readFileSync(p, 'utf8').replace(/<(script|style|title)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
    const latin = dom.match(/[A-Za-z]{2,}/g) ?? [];
    if (latin.length) notes.push(`${f} has Latin words (${[...new Set(latin)].slice(0, 6).join(' ')}): fine for a name, translate the rest.`);
  }
  return { problems, notes };
}

function cmdCheck(copyDir, fromDir, lang, opts = {}) {
  const problems = [], notes = [];
  const noVtt = [], garbled = [], leftOwn = [], leftOther = [];
  const copy = readFilm(copyDir);
  const orig = fromDir ? readFilm(fromDir) : null;
  if (orig && resolve(copyDir) === resolve(fromDir)) problems.push('The copy is the original folder. Work in a copy of the project and leave the original as it was.');

  // The original's voice, words and kept sound
  const origVoices = orig ? voiceClips(orig).filter((v) => existsSync(v.vtt)) : [];
  const origWords = filmWords(origVoices);
  const origAudio = new Map();
  if (orig) for (const c of orig.clips.filter((c) => c.tag === 'audio')) if (existsSync(join(orig.dir, c.file))) origAudio.set(sha(join(orig.dir, c.file)), { file: c.file, voice: origVoices.some((v) => v.file === c.file) });
  const keptSound = (v) => origAudio.get(existsSync(v.path) ? sha(v.path) : '')?.voice === false;

  // The new voice-over
  const voices = voiceClips(copy).filter((v) => !keptSound(v));
  if (!voices.length) problems.push('No voice-over clips in film.html. The new language needs a voice.');
  out(`Voice clips: ${voices.length}`);
  let end = 0;
  for (const [i, v] of voices.entries()) {
    const name = v.file;
    if (origAudio.has(existsSync(v.path) ? sha(v.path) : '') && origAudio.get(sha(v.path)).voice) problems.push(`${name} is the original's voice file. Voice it again in the new language.`);
    if (!existsSync(v.path)) { problems.push(`${name} is not there.`); continue; }
    if (v.speed !== 1) problems.push(`${name} runs at speed ${v.speed}. Never speed or slow a voice to fit: make room in the pictures.`);
    const len = wavSeconds(v.path);
    end = Math.max(end, v.at + (v.out !== undefined ? v.out - v.in : (len ?? 0) - v.in) / v.speed);
    const next = voices[i + 1];
    if (next && v.at + ((v.out ?? len ?? 0) - v.in) / v.speed > next.at + 0.05) problems.push(`${name} and ${next.file} overlap by ${sec(v.at + ((v.out ?? len) - v.in) / v.speed - next.at)}.`);
    if (!existsSync(v.vtt)) { noVtt.push(rel(copyDir, v.vtt)); continue; }
    const raw = readFileSync(v.vtt, 'utf8');
    if (raw.includes(REPLACEMENT)) { garbled.push(rel(copyDir, v.vtt)); continue; }
    const vtt = readVtt(raw);
    const ends = vtt.cues.map((c) => c.end);
    if (!ends.length) { problems.push(`${rel(copyDir, v.vtt)} has no cues.`); continue; }
    const text = vtt.cues.map((c) => plainOf(c.text)).join(' ');
    const timed = vtt.cues.flatMap(cueWords);
    const units = (text.match(/[㐀-鿿぀-ヿ가-힯]/g) ?? []).length + (text.replace(/[㐀-鿿぀-ヿ가-힯]/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length;
    if (new Set(timed.map((k) => k.t)).size < units * 0.5) problems.push(`${rel(copyDir, v.vtt)} times phrases, not words. Studio's word timing and the check below need a time for each word.`);
    if (len !== null && Math.abs(Math.max(...ends) - len) > 0.5) problems.push(`${rel(copyDir, v.vtt)} ends at ${sec(Math.max(...ends))} but its sound runs ${sec(len)}.`);
    if (inLanguage(text, lang) === false) problems.push(`${rel(copyDir, v.vtt)} is not in ${lang}: ${text.slice(0, 40)}`);
  }

  // The new voice's gender, as the voice list labels it, against the original's
  const sides = { m: 'male', f: 'female', male: 'male', female: 'female' };
  const label = sides[(opts.voice ?? '').toLowerCase()], told = sides[(opts.original ?? '').toLowerCase()];
  if (voices.length) {
    const a = told ? { gender: told } : origVoices.length ? voicePitch(origVoices.map((v) => v.path)) : { gender: null };
    const b = voicePitch(voices.map((v) => v.path).filter(existsSync));
    out(`Voice: the original is ${a.gender ?? 'unread'}${told ? ' (as told)' : a.hz ? ` (${a.hz.toFixed(0)} Hz)` : ''}; the new one is labelled ${label ?? opts.voice ?? 'nothing'} and measures ${b.hz ? `${b.hz.toFixed(0)} Hz` : 'unread'}`);
    if (!label && opts.voice !== 'unknown') problems.push(`Say what the voice list labels the new voice: --voice f, --voice m or --voice unknown. The original voice is ${a.gender ?? 'not known'}.`);
    else if (label && (a.gender === 'male' || a.gender === 'female') && label !== a.gender) problems.push(`The original voice is ${a.gender} and the new one is labelled ${label}. Voice it in a ${a.gender} voice (\`get voice --gender ${a.gender[0]}\`), or say there is none.`);
    if (label && b.hz && ((label === 'male' && b.hz > 240) || (label === 'female' && b.hz < 125))) problems.push(`The new voice is labelled ${label} but measures ${b.hz.toFixed(0)} Hz: check the label.`);
    if (a.gender !== 'male' && a.gender !== 'female') notes.push("The original's gender is not settled, pitch cannot say: ask the person, or say in your report that the new voice is unmatched.");
    if (opts.voice === 'unknown') notes.push("The voice list does not give the new voice's gender: say so in your report.");
  }

  // Files left behind
  const used = new Set(copy.clips.map((c) => resolve(copyDir, c.file)));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const p of walk(copyDir)) {
    if (!/\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(p) || used.has(resolve(p))) continue;
    const hash = sha(p);
    (origAudio.has(hash) ? leftOwn : leftOther).push(rel(copyDir, p));
  }

  const some = (l) => (l.length > 3 ? `${l.slice(0, 3).join(', ')} and ${l.length - 3} more` : l.join(', '));
  if (noVtt.length) problems.push(`No .vtt beside ${noVtt.length} voice ${noVtt.length > 1 ? 'files' : 'file'} (${some(noVtt)}). Studio makes subtitles from the .vtt beside each voice clip: save the voice service's word times there.`);
  if (garbled.length) problems.push(`${some(garbled)} ${garbled.length > 1 ? 'are' : 'is'} garbled (saved with the wrong encoding). Write ${garbled.length > 1 ? 'them' : 'it'} again as UTF-8.`);
  if (leftOwn.length) problems.push(`The original's voice is still in the project, unused: ${some(leftOwn)}. Delete ${leftOwn.length > 1 ? 'them' : 'it'} and the .vtt beside: the person sees every file in Studio.`);
  if (leftOther.length) problems.push(`Sound the film does not use: ${some(leftOther)}. Delete ${leftOther.length > 1 ? 'them' : 'it'}.`);

  // Pictures on their words
  const newWords = filmWords(voices);
  const tied = orig ? orig.clips.filter((c) => c.tag !== 'audio' && c.at > 0.02 && !c.hidden).map((c) => ({ c, near: origWords.reduce((m, w) => (Math.abs(w.t - c.at) < Math.abs(m.t - c.at) ? w : m), { t: Infinity }) }))
    .filter((x) => Math.abs(x.near.t - x.c.at) <= 2 * FRAME + 1e-6) : [];
  const far = [];
  for (const { c, near } of tied) {
    const now = copy.clips.find((k) => k.id === c.id && k.tag !== 'audio');
    if (!now) { notes.push(`${c.id} was on "${near.w}" in the original and is not in the copy.`); continue; }
    if (!newWords.length) break;
    const best = newWords.reduce((m, w) => (Math.abs(w.t - now.at) < Math.abs(m.t - now.at) ? w : m));
    let target = best;
    // A picture that was on a number goes on the number, not on the words before it
    const nums = newWords.filter((w) => isNumber(w.w) && Math.abs(w.t - now.at) <= 2);
    const closest = nums.length ? nums.reduce((m, w) => (Math.abs(w.t - now.at) < Math.abs(m.t - now.at) ? w : m)) : null;
    const why = isNumber(near.w) ? 'it was on a number' : '';
    if (why && closest) target = closest;
    const off = (now.at - target.t) / FRAME;
    far.push({ id: c.id, was: near.w, now: target.w, frames: off, at: now.at, to: target.t, why });
    // A card of a few words with a number in it is for the number, unless its page times moments of its own
    const card = now.tag === 'iframe' && existsSync(join(copyDir, now.file))
      ? readFileSync(join(copyDir, now.file), 'utf8').replace(/<(script|style|title)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').trim() : '';
    const gap = closest ? (now.at - closest.t) / FRAME : 0;
    if (!why && closest && /\d/.test(card) && card.split(/\s+/).length <= 6 && Math.abs(gap) > 2) {
      notes.push(`${c.id} is a card with a number and starts ${Math.abs(gap).toFixed(1)} frames ${gap > 0 ? 'after' : 'before'} "${closest.w}" at ${closest.t.toFixed(3)}. A card goes on its number; a page that times moments of its own stays on its line.`);
    }
  }
  out(`Pictures that sat on a word in the original: ${tied.length}`);
  for (const f of far) out(`  ${f.id.padEnd(18)} "${f.was}" -> "${f.now}"  ${f.frames >= 0 ? '+' : ''}${f.frames.toFixed(1)} frames`);
  for (const f of far) if (Math.abs(f.frames) > 2) problems.push(`${f.id} starts at ${sec(f.at)}, ${Math.abs(f.frames).toFixed(1)} frames ${f.frames > 0 ? 'after' : 'before'} "${f.now}" at ${sec(f.to)}${f.why ? ` (${f.why})` : ''}. Move it to ${f.to.toFixed(3)}, or say why it stays.`);
  const worst = far.reduce((m, f) => Math.max(m, Math.abs(f.frames)), 0);
  if (far.length) out(`Furthest picture from its word: ${worst.toFixed(1)} frames; ${far.filter((f) => Math.abs(f.frames) <= 2).length} of ${far.length} within two frames. Say this number, from here.`);
  if (orig && !tied.length) notes.push('No picture in the original sat on a word start, so none was checked: say how you matched pictures to words.');

  // Caption tracks
  const texts = originalCaptionTexts(fromDir);
  const caps = copy.tracks.filter((t) => ['captions', 'subtitles'].includes(t.kind));
  out(`Caption tracks: ${caps.length}`);
  const langs = new Map();
  for (const t of caps) {
    const st = trackState(copy, t, newWords, lang, texts);
    if (st.missing) { problems.push(`${t.src}: the caption file is not there.`); continue; }
    out(`  ${t.src}: ${st.cues} cues, srclang ${t.srclang ?? '-'}, ${st.onWord} start on a word, words like the voice's ${(st.speech * 100).toFixed(0)}%`);
    if (st.wrongLanguage) problems.push(`${t.src} still shows the original's language${t.srclang !== undefined && primary(t.srclang) !== primary(lang) ? ` (srclang ${t.srclang})` : ''}. Run \`captions <copy> --to ${lang}\`${t.locked ? ' (the track is locked: tell the person)' : ''}.`);
    else {
      if (st.onWord < st.cues * 0.9) problems.push(`${t.src} has ${st.cues - st.onWord} of ${st.cues} cues off the new voice's words: its times are the old film's. Run \`captions <copy> --to ${lang}\`.`);
      if (st.speech < 0.6) notes.push(`${t.src} says other words than the voice (${(st.speech * 100).toFixed(0)}% alike): fine only if that is what the person asked for.`);
    }
    langs.set(primary(t.srclang), (langs.get(primary(t.srclang)) ?? 0) + 1);
  }
  for (const [l, n] of langs) if (n > 1) notes.push(`${n} caption tracks are in ${l}: remove the one that repeats.`);

  // Text in pages
  const pages = pageText(copy, fromDir, lang);
  problems.push(...pages.problems);
  notes.push(...pages.notes);

  // Length
  if (orig) {
    const oend = origVoices.reduce((m, v) => Math.max(m, v.at + ((v.out ?? wavSeconds(v.path) ?? 0) - v.in) / v.speed), 0);
    if (oend && end) out(`Voice ends at ${sec(end)}; the original's ended at ${sec(oend)}.`);
  }

  out();
  for (const n of notes) out(`note: ${n}`);
  if (problems.length) {
    out('To fix:');
    problems.forEach((p, i) => out(`${i + 1}. ${p}`));
    out('Fix these, then run check again. What stays unfixed goes in your report, with why.');
    return 1;
  }
  out('Nothing to fix by this check. It reads clips and files, not pages: a moment inside a page (a number counting up, a bar that grows) is still yours to time against its word.');
  out('In your report: the furthest picture above, the lines that changed in meaning and why, the text left inside footage, and that no native speaker has checked the translation.');
  return 0;
}

/* ── command line ────────────────────────────────────────────────────── */

const USAGE = `dub.mjs voice <project | audio file>      the original voice's gender, from its pitch
dub.mjs captions <copy> --to <language>   caption tracks written again from the new voice
dub.mjs check <copy> --from <original> --to <language> --voice <f|m|unknown> [--original <f|m>]`;

function main(argv) {
  const [cmd, target] = argv;
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
  const lang = arg('to');
  if (!['voice', 'captions', 'check'].includes(cmd) || !target || target.startsWith('--')) { console.error(USAGE); return 2; }
  if (!existsSync(target)) { console.error(`${target} is not there`); return 2; }
  if (cmd !== 'voice' && !lang) { console.error(`${cmd} needs --to <language code>, like en or zh`); return 2; }
  if (cmd !== 'voice' && !existsSync(join(target, 'film.html'))) { console.error(`${target} has no film.html`); return 2; }
  if (cmd === 'voice') return cmdVoice(target);
  if (cmd === 'captions') return cmdCaptions(target, lang, arg('from'));
  return cmdCheck(target, arg('from'), lang, { voice: arg('voice'), original: arg('original') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
