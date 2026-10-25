#!/usr/bin/env node
/* 演示：把 packs/ 下每个包都在自己的 data.example.json 上跑一遍。
 * 用法：node examples/run-all.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePack, runPack } from '../core/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = path.join(ROOT, 'packs');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

for (const name of fs.readdirSync(PACKS)) {
  const packFile = path.join(PACKS, name, 'pack.json');
  const dataFile = path.join(PACKS, name, 'data.example.json');
  if (!fs.existsSync(packFile)) continue;
  const pack = normalizePack(readJson(packFile));
  const records = fs.existsSync(dataFile) ? (readJson(dataFile).records || []) : [{}];
  console.log(`\n## ${name} — ${pack.title} (${pack.rules.length} 条规则)`);
  for (const rec of records) {
    const out = runPack(pack, rec);
    const label = rec['案例'] || rec.case || '(未命名)';
    console.log(`  - ${label}: ${out.final_state.verdict}  [红旗 ${(out.final_state.red_flags || []).length}]`);
  }
}
