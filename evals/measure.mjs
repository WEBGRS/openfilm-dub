#!/usr/bin/env node
// Measures a dubbed OpenFilm project against a cue sheet, from its film.html, its .vtt files and a render of it.
// node measure.mjs <project> <cues.json> --mp4 <render> --to en|zh [--words <vtt>] [--vtts <dir>] [--self] [--source <original>] [--original <dir>] [--map <file.json>] [--json]
// --words: one WebVTT on the film's clock (a transcript of the render) instead of the voice clips' own .vtt files
// --vtts: read each voice clip's .vtt from this folder
// --self: the original film, its cues found by the original's words
// --control: the original film against the word times stored in the cue sheet
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? undefined : process.argv[i + 1]; };
const [project, cuesFile] = process.argv.slice(2);
const mp4 = arg('mp4'), to = arg('to'), sourceDir = arg('source'), mapFile = arg('map'), wordsFile = arg('words'), vttDir = arg('vtts');
const self = process.argv.includes('--self');
const FPS = 30, W = 480, H = 270;
const sheet = JSON.parse(readFileSync(cuesFile, 'utf8'));
const map = mapFile ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};

// Clips in film.html, track by track
const stamp = (s) => { const p = s.split(':').map(Number); return p.reduce((a, b) => a * 60 + b, 0); };
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const film = readFileSync(join(project, 'film.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const clips = [];
for (const sec of film.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
  if (/\bhidden\b/.test(sec[1])) continue;
  for (const m of sec[2].matchAll(/<(iframe|img|video|audio)\b[^>]*>/g)) {
    const raw = attr(m[0], 'src');
    if (!raw) continue;
    const [file, frag] = raw.split('#t=');
    const [a, b] = (frag ?? '').split(',');
    clips.push({
      tag: m[1], id: attr(m[0], 'id'), file: decodeURI(file), in: a ? Number(a) : 0, out: b ? Number(b) : undefined,
      at: Number(attr(m[0], 'at') ?? 0), speed: Number(attr(m[0], 'speed') ?? 1), muted: /\bmuted\b/.test(m[0]) || /\bmuted\b/.test(sec[1]),
    });
  }
}

// WebVTT words on the film's clock
const parseVtt = (text) => {
  const out = [];
  for (const m of text.matchAll(/(\d[\d:.]*\d) --> (\d[\d:.]*\d)[^\r\n]*\r?\n((?:[^\r\n]+\r?\n?)+)/g)) {
    let t = stamp(m[1]);
    for (const part of m[3].replace(/\r?\n/g, ' ').split(/(<[\d:.]+>)/)) {
      const tag = /^<([\d:.]+)>$/.exec(part);
      if (tag) t = stamp(tag[1]);
      else if (part.trim()) out.push({ t, w: part.trim() });
    }
  }
  return out;
};
const voices = clips.filter((c) => c.tag === 'audio' && !c.muted && !/^(music|bed)/i.test(basename(c.file)))
  .map((c) => {
    const vtt = join(project, c.file.replace(/\.[^.]+$/, '.vtt'));
    return { ...c, vtt: vttDir ? join(vttDir, basename(vtt)) : vtt };
  });
const words = [];
if (wordsFile) words.push(...parseVtt(readFileSync(wordsFile, 'utf8')));
else for (const v of voices) {
  if (!existsSync(v.vtt)) continue;
  for (const k of parseVtt(readFileSync(v.vtt, 'utf8'))) {
    if (k.t < v.in - 0.001 || (v.out !== undefined && k.t >= v.out)) continue;
    words.push({ t: v.at + (k.t - v.in) / v.speed, w: k.w });
  }
}
words.sort((a, b) => a.t - b.t);

// One string of what is said, each character knowing its word's time
const isCjk = (c) => /[㐀-鿿]/.test(c);
let said = '';
const when = [];
for (const k of words) {
  if (said && !isCjk(said.at(-1)) && !isCjk(k.w[0])) { said += ' '; when.push(k.t); }
  for (const c of k.w) { said += c.toLowerCase(); when.push(k.t); }
}
const findWord = (re, nth) => {
  const all = [...said.matchAll(new RegExp(re, 'gi'))];
  return all[nth] ? when[all[nth].index] : undefined;
};

// Frames: where the picture changes, and where it is black
const frameScan = () => new Promise((resolve, reject) => {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', `fps=${FPS},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const size = W * H;
  let held = Buffer.alloc(0), prev = null, n = 0;
  const change = [], dark = [];
  ff.stdout.on('data', (d) => {
    held = Buffer.concat([held, d]);
    while (held.length >= size) {
      const f = held.subarray(0, size);
      let moved = 0, sum = 0;
      for (let i = 0; i < size; i++) {
        sum += f[i];
        if (prev && Math.abs(f[i] - prev[i]) > 8) moved++;
      }
      change.push(moved / size);
      dark.push(sum / size < 4);
      prev = Buffer.from(f);
      held = held.subarray(size);
      n++;
    }
  });
  ff.on('close', (c) => (c ? reject(new Error('ffmpeg ' + c)) : resolve({ change, dark, n })));
});
const scan = mp4 ? await frameScan() : null;
const onsets = [];
if (scan) {
  for (let i = 1; i < scan.change.length; i++) {
    if (scan.change[i] > 0.0006 && scan.change[i - 1] <= 0.0006) onsets.push(i / FPS);
  }
}

// A page's own length
const lengthOf = (c) => {
  if (c.out !== undefined) return (c.out - c.in) / c.speed;
  const p = join(project, c.file);
  if (!existsSync(p)) return undefined;
  const s = readFileSync(p, 'utf8');
  const m = /duration\s*:\s*([\d.]+)/.exec(s) ?? /const D\s*=\s*([\d.]+)/.exec(s);
  return m ? Number(m[1]) : undefined;
};

// Find the clip a cue is about
const stem = (s) => basename(s).replace(/\.[^.]+$/, '').toLowerCase();
const clipFor = (cue, near) => {
  const want = map[cue.id] ?? cue.clip;
  const hits = clips.filter((c) => c.tag !== 'audio' && (c.id === want || basename(c.file) === want || stem(c.file).includes(stem(want))));
  if (!hits.length) return null;
  return hits.sort((a, b) => Math.abs(a.at - near) - Math.abs(b.at - near))[0];
};

const rows = sheet.cues.map((cue) => {
  // --control: the original film against its own word times
  const word = process.argv.includes('--control') ? cue.sourceAt : findWord(self ? cue.word : cue.target, cue.nth ?? 0);
  if (word === undefined) return { id: cue.id, status: 'word not found', target: self ? cue.word : cue.target };
  const c = clipFor(cue, word);
  if (!c) return { id: cue.id, word, status: 'picture not found', want: map[cue.id] ?? cue.clip };
  let pic = c.at, note = '';
  if (cue.kind === 'hit') {
    const len = lengthOf(c) ?? Infinity;
    const inside = onsets.filter((t) => t >= c.at - 1.5 / FPS && t < c.at + len - 0.05);
    if (inside[cue.hit] === undefined) return { id: cue.id, word, status: `only ${inside.length} changes on the page` };
    pic = inside[cue.hit];
  } else if (scan && !onsets.some((t) => Math.abs(t - c.at) <= 3 / FPS)) {
    note = 'no change in the frames at this clip';
  }
  return { id: cue.id, word: +word.toFixed(3), pic: +pic.toFixed(3), frames: +((pic - word) * FPS).toFixed(1), note };
});
const placed = rows.filter((r) => r.frames !== undefined);
const abs = placed.map((r) => Math.abs(r.frames));

// Words left on screen in the original's language
const pages = [...new Set(clips.filter((c) => c.tag === 'iframe').map((c) => c.file))];
const left = [];
for (const f of pages) {
  const p = join(project, f);
  if (!existsSync(p)) continue;
  const html = readFileSync(p, 'utf8');
  const dom = html.replace(/<(script|style|title)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  if (to === 'en') {
    const js = [...html.matchAll(/<script\b[\s\S]*?<\/script>/g)].map((m) => m[0].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')).join(' ');
    const cjk = (dom + js).match(/[㐀-鿿]+/g) ?? [];
    if (cjk.length) left.push(`${f}: ${cjk.join(' ')}`);
  }
  if (to === 'zh') {
    const latin = dom.match(/[A-Za-z]{2,}/g) ?? [];
    if (latin.length) left.push(`${f}: ${latin.join(' ')}`);
  }
}

// Whether the original project is as it was
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (d, base = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('.') || e.name === 'node_modules') return [];
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p, base) : [relative(base, p).replace(/\\/g, '/')];
});
let changed = null;
if (sourceDir) {
  const root = arg('original') ?? project;
  changed = walk(sourceDir).filter((f) => !existsSync(join(root, f)) || hash(join(root, f)) !== hash(join(sourceDir, f)));
}

// Sound and length
const voiceEnd = voices.map((v) => {
  const wav = join(project, v.file);
  let d = v.out !== undefined ? v.out - v.in : 0;
  if (!d && existsSync(wav) && wav.endsWith('.wav')) {
    const b = readFileSync(wav);
    d = b.readUInt32LE(b.indexOf('data') + 4) / (b.readUInt32LE(24) * b.readUInt16LE(22) * (b.readUInt16LE(34) / 8));
  }
  return { at: v.at, end: v.at + d / v.speed };
}).sort((a, b) => a.at - b.at);
let overlap = 0;
for (let i = 1; i < voiceEnd.length; i++) overlap += Math.max(0, voiceEnd[i - 1].end - voiceEnd[i].at);

// Whether Studio could make subtitles: a readable .vtt that runs as long as its sound, words timed
const vttCheck = voices.map((v) => {
  const own = join(project, v.file.replace(/\.[^.]+$/, '.vtt'));
  if (!existsSync(own)) return 'missing';
  const raw = readFileSync(own);
  const text = raw.toString('utf8');
  if (text.includes('�')) return 'unreadable';
  const parts = parseVtt(text);
  const wav = join(project, v.file);
  const b = readFileSync(wav);
  const d = b.readUInt32LE(b.indexOf('data') + 4) / (b.readUInt32LE(24) * b.readUInt16LE(22) * (b.readUInt16LE(34) / 8));
  const ends = [...text.matchAll(/--> (\d[\d:.]*\d)/g)].map((m) => stamp(m[1]));
  if (!ends.length || Math.abs(Math.max(...ends) - d) > 0.5) return 'wrong length';
  const plain = text.replace(/<[^>]+>/g, '').replace(/^.*-->.*$/gm, '').replace(/WEBVTT/, '');
  const units = to === 'zh' ? (plain.match(/[㐀-鿿]/g) ?? []).length : (plain.match(/[A-Za-z0-9.'-]+/g) ?? []).length;
  if (parts.length < units * 0.5) return 'phrases, not words';
  return 'ok';
});
const vttTally = {};
for (const r of vttCheck) vttTally[r] = (vttTally[r] ?? 0) + 1;

const report = {
  project: basename(project),
  cues: sheet.cues.length,
  placed: placed.length,
  furthest_frames: abs.length ? Math.max(...abs) : null,
  within_2_frames: abs.filter((f) => f <= 2).length,
  median_frames: abs.length ? [...abs].sort((a, b) => a - b)[Math.floor(abs.length / 2)] : null,
  source_language_left: left,
  voice_clips: voices.length,
  voice_vtt: vttTally,
  voice_speeds_not_1: voices.filter((v) => v.speed !== 1).length,
  voice_overlap_seconds: +overlap.toFixed(2),
  voice_end: voiceEnd.length ? +voiceEnd.at(-1).end.toFixed(2) : null,
  render_seconds: scan ? +(scan.n / FPS).toFixed(2) : null,
  black_seconds: scan ? +(scan.dark.filter(Boolean).length / FPS).toFixed(2) : null,
  original_files_changed: changed,
  rows,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
  for (const r of rows) console.log(r.frames !== undefined ? `${r.id.padEnd(18)} word ${String(r.word).padStart(7)}  picture ${String(r.pic).padStart(7)}  ${String(r.frames).padStart(7)} f ${r.note}` : `${r.id.padEnd(18)} ${r.status} ${r.target ?? r.want ?? ''}`);
  const { rows: _, ...rest } = report;
  console.log(JSON.stringify(rest, null, 1));
}
