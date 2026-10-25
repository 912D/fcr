/* FCR 一致性测试（见 spec/conformance.md）
 * 运行：node --test（在仓库根目录）
 * 零依赖，只用 Node 标准库。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePack, runPack } from '../core/index.mjs';
import { validatePack } from '../core/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACKS = path.join(ROOT, 'packs');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

function packDirs() {
  return fs.readdirSync(PACKS).filter((d) => fs.existsSync(path.join(PACKS, d, 'pack.json')));
}

function loadPack(name) {
  return normalizePack(readJson(path.join(PACKS, name, 'pack.json')));
}

function loadData(name) {
  const f = path.join(PACKS, name, 'data.example.json');
  return fs.existsSync(f) ? readJson(f) : { records: [] };
}

const SIX = 'sci-ml-six-questions';
const DATA = loadData(SIX).records;

test('C1 所有随仓库发布的包 validate 零错误', () => {
  for (const name of packDirs()) {
    const { errors, warnings } = validatePack(readJson(path.join(PACKS, name, 'pack.json')));
    assert.deepEqual(errors, [], `${name} 有错误: ${errors.join('; ')}`);
    assert.ok(warnings.length >= 0);
  }
});

test('C2 空状态 -> 信息不足，且 8 个缺项', () => {
  const out = runPack(loadPack(SIX), {});
  assert.match(String(out.final_state.verdict), /信息不足/);
  assert.equal(out.final_state.missing_inputs.length, 8);
  assert.equal(out.stopped_reason, 'no_match');
});

test('C3 示例数据结论与 _expected 一致', () => {
  const pack = loadPack(SIX);
  for (const rec of DATA) {
    const out = runPack(pack, rec);
    assert.equal(out.final_state.verdict, rec._expected.verdict, rec['案例']);
  }
});

test('C4 确定性：同输入两次运行结果深相等', () => {
  const pack = loadPack(SIX);
  const a = runPack(pack, DATA[0]);
  const b = runPack(pack, DATA[0]);
  assert.deepEqual(a.final_state, b.final_state);
  assert.equal(a.steps.length, b.steps.length);
  assert.equal(a.iterations, b.iterations);
});

test('C5 优先级：priority 小的先触发', () => {
  const pack = {
    format: 'fcr/rulepack', format_version: '1.0', id: 't', version: '1.0.0', title: 't', fields: {},
    rules: [
      { rule_id: 'B', priority: 20, condition: 'state.get("x") is None', description: 'later', actions: [{ atom_id: 'append_once', params: { key: "'log'", value: "'b'" } }] },
      { rule_id: 'A', priority: 1, condition: 'state.get("x") is None', description: 'first', actions: [{ atom_id: 'append_once', params: { key: "'log'", value: "'a'" } }] }
    ]
  };
  const out = runPack(pack, {});
  assert.equal(out.steps[0].rule_id, 'A');
  assert.deepEqual(out.final_state.log, ['a', 'b']);
});

test('C6 轨迹完整：变更字段都在 changes 里，fires == steps 长度', () => {
  const out = runPack(loadPack(SIX), DATA[1]);
  assert.equal(out.fires, out.steps.length);
  for (const s of out.steps) {
    for (const f of s.changed_fields) {
      assert.ok(s.changes.some((c) => c.key === f), `step ${s.rule_id} 缺少 ${f} 的变更记录`);
    }
  }
});

test('C7 幂等：append_once 不产生重复项', () => {
  const out = runPack(loadPack(SIX), DATA[2]);
  const flags = out.final_state.red_flags || [];
  assert.equal(new Set(flags).size, flags.length);
  const checks = out.final_state.required_checks || [];
  assert.equal(new Set(checks).size, checks.length);
});

test('C8 守卫：示例数据不出现 max_iter', () => {
  for (const rec of DATA) {
    const out = runPack(loadPack(SIX), rec);
    assert.notEqual(out.stopped_reason, 'max_iter', rec['案例']);
  }
});

test('C9 legacy 兼容：去掉 format 字段仍能跑且结论一致', () => {
  const modern = readJson(path.join(PACKS, SIX, 'pack.json'));
  const legacy = { ...modern };
  delete legacy.format;
  delete legacy.format_version;
  legacy['逻辑组'] = modern.id;
  for (const rec of DATA) {
    const a = runPack(normalizePack(modern), rec);
    const b = runPack(legacy, rec);
    assert.equal(a.final_state.verdict, b.final_state.verdict, rec['案例']);
  }
});

test('C10 电池包草案：示例结论符合预期', () => {
  const name = 'battery-ml';
  const pack = loadPack(name);
  const recs = loadData(name).records;
  assert.ok(recs.length >= 2);
  for (const rec of recs) {
    const out = runPack(pack, rec);
    assert.equal(out.final_state.verdict, rec._expected.verdict, rec['案例']);
  }
});

test('模板包可运行', () => {
  const name = 'template';
  const pack = loadPack(name);
  const recs = loadData(name).records;
  const out = runPack(pack, recs[0]);
  assert.equal(out.final_state.verdict, '可进入下一步');
  const missing = runPack(pack, recs[1]);
  assert.match(String(missing.final_state.verdict), /信息不足/);
});

test('校验器能抓住已知错误：未加引号的 key、无守卫的 set_field', () => {
  const bad = {
    format: 'fcr/rulepack', format_version: '1.0', id: 'bad', version: '1.0.0', title: 'bad', fields: {},
    rules: [
      { rule_id: 'X1', priority: 1, condition: "state.get('a') == 1", description: 'bad key', actions: [{ atom_id: 'append_once', params: { key: 'red_flags', value: "'x'" } }] },
      { rule_id: 'X2', priority: 2, condition: "state.get('b') == 1", description: 'no guard', actions: [{ atom_id: 'set_field', params: { key: "'c'", value: "'y'" } }] }
    ]
  };
  const { errors } = validatePack(bad);
  assert.ok(errors.some((e) => /params\.key 未加引号/.test(e)));
  assert.ok(errors.some((e) => /没有守卫/.test(e)));
});

test('max_iter 截断可观测', () => {
  const pack = {
    format: 'fcr/rulepack', format_version: '1.0', id: 't', version: '1.0.0', title: 't', fields: {},
    rules: [{ rule_id: 'L', priority: 1, condition: 'state.get("n") is None', description: 'loop', actions: [{ atom_id: 'set_field', params: { key: "'n'", value: 'state.get("n")' } }] }]
  };
  const out = runPack(pack, {}, { maxIter: 3 });
  assert.equal(out.stopped_reason, 'max_iter');
  assert.equal(out.iterations, 3);
});
