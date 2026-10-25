/* FCR · 公共入口
 *
 * 用法：
 *   import { runPack, loadPackLike, ATOMS } from './core/index.mjs';
 *   const out = runPack(pack, state);          // -> {final_state, steps, ...}
 */

import {
  parseCondition,
  evalCondition,
  execAtom,
  runChain,
  pyTruthy,
  pyEq,
  pyLiteral,
  deepClone,
  makeBuiltins
} from './engine.mjs';
import { ATOMS, ATOM_IDS } from './atoms.mjs';

/** 旧格式（无 format 字段）自动包装；新格式原样返回。 */
export function normalizePack(input) {
  const pack = input && typeof input === 'object' ? input : {};
  if (pack.format === 'fcr/rulepack') return pack;
  return {
    format: 'fcr/rulepack',
    format_version: '0',
    legacy: true,
    id: pack['逻辑组'] || pack.id || 'legacy-pack',
    version: pack['版本'] || pack.version || '0.0.0',
    title: pack.title || pack['逻辑组'] || 'legacy pack',
    description: pack['说明'] || pack.description || '旧格式规则包（legacy 模式）',
    fields: pack.fields || pack['字段字典'] || {},
    atoms: pack.atoms || {},
    rules: pack.rules || []
  };
}

/** 运行一个规则包。返回引擎原始结果。 */
export function runPack(pack, state, opts = {}) {
  const p = normalizePack(pack);
  return runChain({
    rules: p.rules || [],
    atoms: ATOMS,
    initial_state: state || {},
    max_iter: opts.maxIter || opts.max_iter || 200,
    log: opts.log || null
  });
}

export {
  parseCondition,
  evalCondition,
  execAtom,
  runChain,
  pyTruthy,
  pyEq,
  pyLiteral,
  deepClone,
  makeBuiltins,
  ATOMS,
  ATOM_IDS
};
