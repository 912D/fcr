#!/usr/bin/env node
/* FCR · 无头命令行
 *
 * 用法：
 *   node cli/fcr.mjs run      --pack <pack.json> --data <data.json|-> [--case N] [--json] [--max-iter 200]
 *   node cli/fcr.mjs explain  --pack <pack.json> --data <data.json|-> [--case N]
 *   node cli/fcr.mjs validate <pack.json> [more.json ...]
 *   node cli/fcr.mjs schema   [--out <file>]
 *   node cli/fcr.mjs packs    [目录]
 *   node cli/fcr.mjs --version | --help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePack, runPack } from '../core/index.mjs';
import { validatePack } from '../core/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERSION = '1.0.0';

function usage(code = 2) {
  console.log(`FCR ${VERSION} — 科研 ML 前置校验的前向链规则引擎

用法:
  node cli/fcr.mjs run      --pack <pack.json> --data <data.json|-> [--case N] [--json] [--max-iter 200]
  node cli/fcr.mjs explain  --pack <pack.json> --data <data.json|-> [--case N]
  node cli/fcr.mjs validate <pack.json> [more.json ...]
  node cli/fcr.mjs schema   [--out <file>]
  node cli/fcr.mjs packs    [目录]
  node cli/fcr.mjs --version | --help

示例:
  node cli/fcr.mjs run --pack packs/sci-ml-six-questions/pack.json \\
    --data packs/sci-ml-six-questions/data.example.json --json
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function readJson(file) {
  if (file === '-') return JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(/^\uFEFF/, ''));
}

function casesOf(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.records)) return data.records;
  return [data || {}];
}

function caseName(obj, i) {
  return obj && (obj['案例'] || obj.case || obj.id || obj.name) || `case ${i}`;
}

function runOne(pack, rec, opts) {
  const res = runPack(pack, rec, { maxIter: opts.maxIter });
  return {
    case: caseName(rec, opts.index),
    verdict: res.final_state.verdict,
    next_action: res.final_state.next_action,
    red_flags: res.final_state.red_flags || [],
    required_checks: res.final_state.required_checks || [],
    candidate_families: res.final_state.candidate_families || [],
    missing_inputs: res.final_state.missing_inputs || [],
    iterations: res.iterations,
    fires: res.fires,
    effective_steps: res.steps.filter((s) => s.changed_fields.length).length,
    stopped_reason: res.stopped_reason,
    _res: res
  };
}

function cmdRun(args) {
  if (!args.pack || !args.data) usage();
  const pack = normalizePack(readJson(args.pack));
  const data = readJson(args.data);
  const all = casesOf(data);
  const idx = args.case !== undefined ? Number(args.case) : null;
  const selected = idx === null ? all : [all[idx]].filter(Boolean);
  if (!selected.length) { console.error(`没有第 ${idx} 条案例`); process.exit(1); }

  const results = selected.map((rec, k) => runOne(pack, rec, { maxIter: Number(args['max-iter'] || 200), index: idx === null ? k : idx }));

  if (args.json) {
    console.log(JSON.stringify(results.map(({ _res, ...r }) => r), null, 2));
    return;
  }
  for (const r of results) {
    console.log(`=== ${r.case} ===`);
    console.log(`结论    : ${r.verdict || '(未产生 verdict，检查规则包)'}`);
    console.log(`下一步  : ${r.next_action || '-'}`);
    console.log(`红旗(${r.red_flags.length})  : ${r.red_flags.join(' | ') || '-'}`);
    console.log(`必检(${r.required_checks.length})  : ${r.required_checks.join(' | ') || '-'}`);
    console.log(`候选族  : ${r.candidate_families.join(' | ') || '-'}`);
    console.log(`缺失项  : ${r.missing_inputs.join(' | ') || '-'}`);
    console.log(`迭代/触发/有效步/停止: ${r.iterations} / ${r.fires} / ${r.effective_steps} / ${r.stopped_reason}`);
    console.log('');
  }
  if (results.length > 1) {
    const bad = results.filter((r) => !/^可进入基线/.test(String(r.verdict)));
    console.log(`汇总: ${results.length} 条，需先处理 ${bad.length} 条，可进入基线 ${results.length - bad.length} 条`);
  }
}

function cmdExplain(args) {
  if (!args.pack || !args.data) usage();
  const pack = normalizePack(readJson(args.pack));
  const all = casesOf(readJson(args.data));
  const idx = args.case !== undefined ? Number(args.case) : 0;
  const rec = all[idx];
  if (!rec) { console.error(`没有第 ${idx} 条案例`); process.exit(1); }
  const r = runOne(pack, rec, { maxIter: Number(args['max-iter'] || 200), index: idx });
  console.log(`=== ${r.case} · 轨迹 ===`);
  console.log(`结论: ${r.verdict || '-'}
说明: 默认只显示有字段变更的步骤；加 --all 显示全部触发（含无变更的稳定化步骤）。\n`);
  const steps = args.all ? r._res.steps : r._res.steps.filter((s) => s.changes.length);
  steps.forEach((s) => {
    console.log(`#${s.iteration} [${s.group}/${s.priority}] ${s.rule_id}`);
    console.log(`   条件: ${s.condition}`);
    if (!s.changes.length) console.log('   无字段变更（进入稳定集）');
    for (const c of s.changes) {
      const before = s.state_before[c.key];
      const after = s.state_after[c.key];
      const fmt = (v) => v === undefined ? '(无)' : JSON.stringify(v);
      console.log(`   ${c.key}: ${fmt(before)} -> ${fmt(after)}  [${c.atom_id}]`);
    }
  });
  console.log(`\n迭代 ${r.iterations}，触发 ${r.fires}，停止原因 ${r.stopped_reason}`);
}

function cmdValidate(files) {
  if (!files.length) usage();
  let bad = 0;
  for (const f of files) {
    let pack;
    try { pack = readJson(f); }
    catch (e) { console.error(`[ERROR] ${f}: JSON 解析失败: ${e.message}`); bad++; continue; }
    const { errors, warnings, stats } = validatePack(pack);
    const tag = errors.length ? 'FAIL' : 'OK  ';
    console.log(`${tag} ${f}  rules=${stats.rules} fields=${stats.fields} atoms=${JSON.stringify(stats.atoms)}`);
    for (const e of errors) console.log(`  [ERROR] ${e}`);
    for (const w of warnings) console.log(`  [WARN ] ${w}`);
    if (errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}

function cmdSchema(args) {
  const src = path.join(ROOT, 'spec', 'rulepack.schema.json');
  const text = fs.readFileSync(src, 'utf8');
  if (args.out) { fs.writeFileSync(path.resolve(process.cwd(), args.out), text); console.log(`written: ${args.out}`); }
  else console.log(text);
}

function cmdPacks(args) {
  const dir = path.resolve(process.cwd(), args._[0] || path.join(ROOT, 'packs'));
  if (!fs.existsSync(dir)) { console.error(`目录不存在: ${dir}`); process.exit(1); }
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'pack.json');
    if (!fs.existsSync(file)) continue;
    try {
      const p = readJson(file);
      console.log(`${name}\t${p.title || ''}\t${p.version || ''}\t${p.status || 'draft'}\t${(p.rules || []).length} 条`);
    } catch (e) {
      console.log(`${name}\t(JSON 解析失败: ${e.message})`);
    }
  }
}

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const cmd = args._[0];

if (args.version) { console.log(`FCR ${VERSION}`); process.exit(0); }
if (!cmd || args.help) usage(cmd ? 0 : 2);

switch (cmd) {
  case 'run': cmdRun(args); break;
  case 'explain': cmdExplain(args); break;
  case 'validate': cmdValidate(args._.slice(1)); break;
  case 'schema': cmdSchema(args); break;
  case 'packs': cmdPacks(args); break;
  default: console.error(`未知命令: ${cmd}`); usage();
}
