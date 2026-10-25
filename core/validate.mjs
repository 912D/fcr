/* FCR · 规则包校验器（实现 spec/00-格式规范.md §8）
 *
 * 返回 { errors: [...], warnings: [...], stats: {...} }
 * 只做结构性检查 + 条件解析；不执行规则。
 */

import { parseCondition } from './engine.mjs';
import { ATOM_IDS } from './atoms.mjs';

const FIELD_REF = /state\.get\(\s*['"]([^'"]+)['"]\s*\)|state\[\s*['"]([^'"]+)['"]\s*\]|state\.([A-Za-z_][A-Za-z0-9_]*)/g;

function refs(condition) {
  const out = new Set();
  let m;
  FIELD_REF.lastIndex = 0;
  while ((m = FIELD_REF.exec(condition || '')) !== null) {
    out.add(m[1] || m[2] || m[3]);
  }
  return out;
}

function unquote(s) {
  const t = String(s == null ? '' : s).trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
  return null;
}

function hasGuard(condition, field) {
  const c = String(condition || '');
  const q = `['"]${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`;
  const patterns = [
    new RegExp(`state\\.get\\(\\s*${q}\\s*\\)\\s+is\\s+None`),
    new RegExp(`state\\[\\s*${q}\\s*\\]\\s+is\\s+None`),
    new RegExp(`state\\.${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+is\\s+None`)
  ];
  return patterns.some((re) => re.test(c));
}

export function validatePack(pack) {
  const errors = [];
  const warnings = [];
  const stats = { rules: 0, atoms: {}, fields: 0, missing_evidence: 0, by_group: {} };
  const err = (msg, where) => errors.push(where ? `${where}: ${msg}` : msg);
  const warn = (msg, where) => warnings.push(where ? `${where}: ${msg}` : msg);

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    err('规则包必须是 JSON 对象');
    return { errors, warnings, stats };
  }

  const legacy = !pack.format;
  if (!legacy) {
    if (pack.format !== 'fcr/rulepack') err(`format 必须是 "fcr/rulepack"，实际为 ${JSON.stringify(pack.format)}`);
    if (pack.format_version !== '1.0') err(`format_version 必须是 "1.0"，实际为 ${JSON.stringify(pack.format_version)}`);
  } else {
    warn('未声明 format，按 legacy 模式读取（建议迁移到 v1）');
  }
  if (!legacy) {
    for (const k of ['id', 'version', 'title', 'fields']) {
      if (pack[k] == null) err(`缺少顶层字段 ${k}`);
    }
    if (pack.status == null) warn('缺少 status（按 draft 处理）');
  }
  if (!Array.isArray(pack.rules) || pack.rules.length === 0) {
    err('rules 缺失、不是数组或为空');
    return { errors, warnings, stats };
  }

  const fields = (pack.fields && typeof pack.fields === 'object') ? Object.keys(pack.fields) : [];
  stats.fields = fields.length;
  const allowedAtoms = Array.isArray(pack.atoms) && pack.atoms.length ? new Set(pack.atoms) : null;

  const seenIds = new Set();
  const writesByField = new Map();

  pack.rules.forEach((rule, i) => {
    const where = `rules[${i}]${rule && rule.rule_id ? ` (${rule.rule_id})` : ''}`;
    stats.rules++;
    if (!rule || typeof rule !== 'object') { err('规则必须是对象', where); return; }

    if (typeof rule.rule_id !== 'string' || !rule.rule_id.trim()) err('缺少 rule_id 或不是字符串', where);
    else if (seenIds.has(rule.rule_id)) err(`rule_id 重复: ${rule.rule_id}`, where);
    else seenIds.add(rule.rule_id);

    if (typeof rule.priority !== 'number' || !isFinite(rule.priority)) err('priority 必须是数字', where);
    if (typeof rule.condition !== 'string' || !rule.condition.trim()) err('缺少 condition', where);
    else {
      const parsed = parseCondition(rule.condition);
      if (!parsed.ok) err(`condition 解析失败: ${parsed.error}`, where);
    }
    if (typeof rule.description !== 'string' || !rule.description.trim()) err('缺少 description', where);

    if (!Array.isArray(rule.actions) || rule.actions.length === 0) err('actions 缺失或为空', where);
    else {
      rule.actions.forEach((act, j) => {
        const aw = `${where}.actions[${j}]`;
        if (!act || typeof act !== 'object') { err('动作必须是对象', aw); return; }
        if (ATOM_IDS.indexOf(act.atom_id) < 0) err(`未知原子 ${JSON.stringify(act.atom_id)}（内建：${ATOM_IDS.join(', ')}）`, aw);
        else if (allowedAtoms && !allowedAtoms.has(act.atom_id)) err(`原子 ${act.atom_id} 不在本包 atoms 声明内`, aw);

        const params = act.params || {};
        if (typeof params !== 'object' || Array.isArray(params)) { err('params 必须是对象', aw); return; }
        for (const [k, v] of Object.entries(params)) {
          if (typeof v !== 'string') warn(`params.${k} 不是字符串（引擎会 String() 化，建议显式写字符串）`, aw);
        }

        const keyField = unquote(params.key);
        if (params.key !== undefined && keyField === null) {
          err(`params.key 未加引号（会解析成字段引用而不是字面量）：${JSON.stringify(params.key)}`, aw);
        }
        if (keyField && act.atom_id === 'set_field') {
          if (!hasGuard(rule.condition, keyField)) {
            err(`set_field 写标量字段 "${keyField}" 但条件中没有守卫（${`state.get('${keyField}') is None`}），会反复触发到 max_iter`, aw);
          }
        }
        if (keyField) {
          const entry = writesByField.get(keyField) || { scalar: 0, list: 0 };
          if (act.atom_id === 'set_field') entry.scalar++;
          else entry.list++;
          writesByField.set(keyField, entry);
        }
        if (keyField) stats.atoms[act.atom_id] = (stats.atoms[act.atom_id] || 0) + 1;
      });
    }

    if (rule.group) stats.by_group[rule.group] = (stats.by_group[rule.group] || 0) + 1;

    if (!rule.evidence) { stats.missing_evidence++; warn('缺少 evidence（建议标注 heuristic/standard/literature/calibration）', where); }
    else {
      const kind = rule.evidence.kind;
      if (['heuristic', 'standard', 'literature', 'calibration'].indexOf(kind) < 0) err(`evidence.kind 非法: ${JSON.stringify(kind)}`, where);
      if (kind === 'heuristic' && !/未校准|uncalibrated/i.test(String(rule.evidence.note || ''))) warn('evidence=heuristic 但 note 未写"未校准"', where);
      if (kind === 'literature' && !rule.evidence.source) warn('evidence=literature 但缺少 source', where);
    }

    for (const f of refs(rule.condition)) {
      if (fields.length && fields.indexOf(f) < 0 && !writesByField.has(f)) {
        // 输出字段可能尚未在写入表里出现；用整体检查兜底，这里先记警告
        const declaredOutputs = new Set();
        for (const r of pack.rules) for (const a of (r.actions || [])) {
          const k = unquote((a.params || {}).key);
          if (k) declaredOutputs.add(k);
        }
        if (!declaredOutputs.has(f)) warn(`条件引用了未声明的字段 "${f}"`, where);
      }
    }
  });

  for (const [f, e] of writesByField) {
    if (e.scalar > 1) warn(`多个 set_field 写同一标量字段 "${f}"（${e.scalar} 处），可能互相覆盖`);
    if (e.scalar > 0 && e.list > 0) warn(`字段 "${f}" 同时被 set_field 与追加型原子写入，类型可能不一致`);
  }

  return { errors, warnings, stats };
}
