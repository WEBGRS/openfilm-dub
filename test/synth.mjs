// Small projects and sounds built for the tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A mono 16-bit WAV of a voice-like tone: harmonics of f0 that sound in bursts. */
export function tone(f0, seconds, rate = 16000) {
  const n = Math.round(seconds * rate);
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(rate, 24);
  pcm.writeUInt32LE(rate * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // Syllables 0.25 s long with a 0.08 s pause between, and a slight drift in pitch
    const on = (t % 0.33) < 0.25 ? Math.sin((Math.PI * (t % 0.33)) / 0.25) : 0;
    const f = f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 0.7 * t));
    let v = 0;
    for (let k = 1; k <= 8; k++) v += Math.sin(2 * Math.PI * k * f * t) / k;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * on * 0.3)) * 32767), 44 + i * 2);
  }
  return pcm;
}

const vtt = (words, end) => {
  const [first, ...rest] = words;
  return `WEBVTT\n\n00:00:00.000 --> ${stampOf(end)}\n${first.w}${rest.map((k) => `<${stampOf(k.t)}>${k.w}`).join('')}\n`;
};
const stampOf = (s) => `00:00:${s.toFixed(3).padStart(6, '0')}`;
const join2 = (ws) => ws.map((k, i) => ({ ...k, w: i < ws.length - 1 && /[A-Za-z0-9]$/.test(k.w) ? `${k.w} ` : k.w }));

export const ZH = [
  [{ t: 0, w: '公' }, { t: 0.3, w: '元' }, { t: 0.6, w: '前' }, { t: 0.9, w: '256' }, { t: 1.4, w: '年' }, { t: 2, w: '蜀' }],
  [{ t: 0, w: '它' }, { t: 0.6, w: '叫' }, { t: 1.2, w: '都' }, { t: 1.8, w: '江' }, { t: 2.4, w: '堰' }],
];
export const EN = [
  [{ t: 0, w: 'In' }, { t: 0.5, w: '256' }, { t: 1, w: 'BC,' }, { t: 1.4, w: 'Li' }, { t: 1.8, w: 'Bing' }, { t: 2.2, w: 'began' }],
  [{ t: 0, w: 'It' }, { t: 0.4, w: 'is' }, { t: 0.8, w: 'called' }, { t: 1.4, w: 'Dujiangyan.' }],
];

/**
 * A two-line film. Voice lines at 0.3 s and 4.3 s; a card on the first line's number (the third word group) and one on
 * the second line's third word; a track of captions when `captions` is given its text.
 * @param {string} dir
 * @param {{ words: typeof ZH, pitch: number, at?: number[], card?: number, photo?: number, speed?: number, captions?: string, locked?: boolean, extra?: string, vtt?: boolean, page?: string }} o
 */
export function project(dir, o) {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const at = o.at ?? [0.3, 4.3];
  for (const [i, ws] of o.words.entries()) {
    writeFileSync(join(dir, 'assets', `vo-${i + 1}.wav`), tone(o.pitch, 3));
    if (o.vtt !== false) writeFileSync(join(dir, 'assets', `vo-${i + 1}.vtt`), vtt(join2(ws), 3));
  }
  writeFileSync(join(dir, 'card.html'), o.page ?? '<!doctype html><html><body><div>256</div><script>window.film={frame(){}}</script></body></html>');
  writeFileSync(join(dir, 'film.html'), `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"></head>
<body>
${o.captions ? `<section${o.locked ? ' locked' : ''}>\n  <track kind="captions" src="captions/captions.vtt" label="Captions">\n</section>\n` : ''}<section>
  <iframe id="card-num" src="card.html#t=0,2" at="${o.card ?? at[0]}"></iframe>
</section>
<section>
  <img id="photo" src="assets/p.jpg#t=0,3" at="${o.photo ?? at[1]}">
</section>
<section>
${at.map((a, i) => `  <audio id="vo-${i + 1}" src="assets/vo-${i + 1}.wav" at="${a}"${o.speed ? ` speed="${o.speed}"` : ''}></audio>`).join('\n')}
${o.extra ?? ''}</section>
</body>
</html>
`);
  writeFileSync(join(dir, 'assets', 'p.jpg'), 'x');
  if (o.captions) { mkdirSync(join(dir, 'captions'), { recursive: true }); writeFileSync(join(dir, 'captions', 'captions.vtt'), o.captions); }
}
