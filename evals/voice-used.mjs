#!/usr/bin/env node
// Which voice an agent asked the local voice service for, and the gender the service labels it, from a run's log.
// node voice-used.mjs <run.jsonl> [--service http://127.0.0.1:4848]
import { readFileSync } from 'node:fs';

const log = process.argv[2];
const i = process.argv.indexOf('--service');
const service = i < 0 ? 'http://127.0.0.1:4848' : process.argv[i + 1];
const list = await (await fetch(`${service}/voices`)).json();

// Every command and file the agent wrote, not what it read back
const wrote = [];
for (const line of readFileSync(log, 'utf8').split('\n')) {
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  if (o.type !== 'assistant') continue;
  for (const c of o.message.content ?? []) {
    if (c.type === 'tool_use') wrote.push(JSON.stringify(c.input));
  }
}
const text = wrote.join('\n');
const found = list.map((v) => ({ id: v.id, gender: v.gender, lang: v.lang, uses: (text.match(new RegExp(`\\b${v.id}\\b`, 'g')) ?? []).length }))
  .filter((v) => v.uses).sort((a, b) => b.uses - a.uses);
console.log(JSON.stringify(found));
