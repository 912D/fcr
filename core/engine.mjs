/* ============================================================
 * FCR 参考实现 · 前向链规则引擎（ESM 移植）
 *
 * 来源：作者内部实现 chain_engine.cjs（683 行，UMD）。
 * 移植只做结构变换（UMD -> ESM）与增加 parseCondition()，语义未改。
 * 语义定义见 spec/00-格式规范.md §7（冻结）。
 * ============================================================ */

'use strict';

  /* ---------------- 工具 ---------------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(deepClone);
    const o = {};
    for (const k of Object.keys(v)) o[k] = deepClone(v[k]);
    return o;
  }
  function pyTruthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return Boolean(v);
  }
  function pyEq(a, b) {
    if (a === null || a === undefined) a = null;
    if (b === null || b === undefined) b = null;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((x, i) => pyEq(x, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every(k => k in b && pyEq(a[k], b[k]));
    }
    return a === b;
  }
  function pyCmp(op, a, b) {
    switch (op) {
      case '==': return pyEq(a, b);
      case '!=': return !pyEq(a, b);
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case 'is': return a === b;
      case 'is not': return a !== b;
      case 'in': return a !== null && typeof b !== 'string' ? (Array.isArray(b) ? b.some(x => pyEq(a, x)) : (b && typeof b === 'object' ? a in b : false)) : (typeof b === 'string' ? String(a).indexOf(b) >= 0 : false);
      case 'not in': return !pyCmp('in', a, b);
    }
    throw new Error('未知比较: ' + op);
  }
  function pyArith(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : Infinity;
      case '//': return b !== 0 ? Math.floor(a / b) : 0;
      case '%': return b !== 0 ? a % b : 0;
      case '**': return Math.pow(a, b);
    }
    throw new Error('未知运算: ' + op);
  }

  /* ---------------- 条件表达式词法/语法分析 ---------------- */
  const TOK = {
    NUM: 'NUM', STR: 'STR', IDENT: 'IDENT', OP: 'OP', KW: 'KW',
    LP: 'LP', RP: 'RP', LB: 'LB', RB: 'RB', LC: 'LC', RC: 'RC', COMMA: 'COMMA', DOT: 'DOT', COLON: 'COLON', EOF: 'EOF'
  };
  const KEYWORDS = { 'and': 'and', 'or': 'or', 'not': 'not', 'in': 'in', 'is': 'is', 'True': 'True', 'False': 'False', 'None': 'None' };
  const MULTI_OPS = ['==', '!=', '>=', '<=', '//', '**'];
  const SINGLE_OPS = ['>', '<', '+', '-', '*', '/', '%', '='];

  function tokenize(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '(') { toks.push({ t: TOK.LP, v: '(' }); i++; continue; }
      if (ch === ')') { toks.push({ t: TOK.RP, v: ')' }); i++; continue; }
      if (ch === '[') { toks.push({ t: TOK.LB, v: '[' }); i++; continue; }
      if (ch === ']') { toks.push({ t: TOK.RB, v: ']' }); i++; continue; }
      if (ch === '{') { toks.push({ t: TOK.LC, v: '{' }); i++; continue; }
      if (ch === '}') { toks.push({ t: TOK.RC, v: '}' }); i++; continue; }
      if (ch === ',') { toks.push({ t: TOK.COMMA, v: ',' }); i++; continue; }
      if (ch === '.') { toks.push({ t: TOK.DOT, v: '.' }); i++; continue; }
      if (ch === ':') { toks.push({ t: TOK.COLON, v: ':' }); i++; continue; }
      // string
      if (ch === "'" || ch === '"') {
        const quote = ch;
        let j = i + 1, s = '';
        let closed = false;
        while (j < n) {
          if (src[j] === '\\') { s += src[j + 1] || ''; j += 2; continue; }
          if (src[j] === quote) { closed = true; j++; break; }
          s += src[j]; j++;
        }
        if (!closed) throw new Error('字符串未闭合: ' + src.slice(i, i + 20));
        toks.push({ t: TOK.STR, v: s });
        i = j;
        continue;
      }
      // number
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i;
        while (j < n && /[0-9.eE+-]/.test(src[j])) {
          // avoid consuming e+ as operator when not part of number
          if ((src[j] === '+' || src[j] === '-') && j > i && !/[eE]/.test(src[j - 1])) break;
          j++;
        }
        const numStr = src.slice(i, j);
        const val = parseFloat(numStr);
        toks.push({ t: TOK.NUM, v: val });
        i = j;
        continue;
      }
      // identifier / keyword
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j);
        if (word in KEYWORDS) toks.push({ t: TOK.KW, v: KEYWORDS[word] });
        else toks.push({ t: TOK.IDENT, v: word });
        i = j;
        continue;
      }
      // multi-char ops
      const two = src.substr(i, 2);
      if (MULTI_OPS.indexOf(two) >= 0) { toks.push({ t: TOK.OP, v: two }); i += 2; continue; }
      if (SINGLE_OPS.indexOf(ch) >= 0) { toks.push({ t: TOK.OP, v: ch }); i += 1; continue; }
      throw new Error('无法识别的字符: ' + ch);
    }
    toks.push({ t: TOK.EOF, v: '' });
    return toks;
  }

  function Parser(src, env) {
    const toks = tokenize(src);
    let pos = 0;
    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expect(t) {
      const tok = next();
      if (tok.t !== t) throw new Error('期望 ' + t + ' 但得到 ' + tok.v + ' (位置 ' + pos + ')');
      return tok;
    }
    function parseExpr() { return parseOr(); }
    function parseOr() {
      let left = parseAnd();
      while (peek().t === TOK.KW && peek().v === 'or') { next(); const right = parseAnd(); const l = left; left = { ev: () => pyTruthy(l.ev()) ? l.ev() : right.ev() }; }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek().t === TOK.KW && peek().v === 'and') { next(); const right = parseNot(); const l = left; left = { ev: () => pyTruthy(l.ev()) && pyTruthy(right.ev()) ? right.ev() : (pyTruthy(l.ev()) ? right.ev() : l.ev()) }; }
      return left;
    }
    function parseNot() {
      if (peek().t === TOK.KW && peek().v === 'not') {
        next();
        const inner = parseNot();
        return { ev: () => !pyTruthy(inner.ev()) };
      }
      return parseComparison();
    }
    function parseComparison() {
      let left = parseAddSub();
      while (true) {
        const tok = peek();
        if (tok.t === TOK.OP && ['==', '!=', '>', '<', '>=', '<='].indexOf(tok.v) >= 0) {
          next();
          const right = parseAddSub();
          const op = tok.v, l = left;
          left = { ev: () => pyCmp(op, l.ev(), right.ev()) };
        } else if (tok.t === TOK.KW && (tok.v === 'in' || tok.v === 'is')) {
          next();
          let op = tok.v;
          if (op === 'is' && peek().t === TOK.KW && peek().v === 'not') { next(); op = 'is not'; }
          const right = parseAddSub();
          const l = left;
          left = { ev: () => pyCmp(op, l.ev(), right.ev()) };
        } else if (tok.t === TOK.KW && tok.v === 'not') {
          // X not in Y / X not is Y：not 在比较词之前
          next();
          if (peek().t === TOK.KW && (peek().v === 'in' || peek().v === 'is')) {
            const cmpTok = next();
            const op = cmpTok.v === 'in' ? 'not in' : 'is not';
            const right = parseAddSub();
            const l = left;
            left = { ev: () => pyCmp(op, l.ev(), right.ev()) };
          } else break;
        } else break;
      }
      return left;
    }
    function parseAddSub() {
      let left = parseMulDiv();
      while (peek().t === TOK.OP && (peek().v === '+' || peek().v === '-')) {
        const op = next().v;
        const right = parseMulDiv();
        const l = left;
        left = { ev: () => pyArith(op, l.ev(), right.ev()) };
      }
      return left;
    }
    function parseMulDiv() {
      let left = parseUnary();
      while (peek().t === TOK.OP && ['*', '/', '//', '%'].indexOf(peek().v) >= 0) {
        const op = next().v;
        const right = parseUnary();
        const l = left;
        left = { ev: () => pyArith(op, l.ev(), right.ev()) };
      }
      return left;
    }
    function parseUnary() {
      if (peek().t === TOK.OP && peek().v === '-') {
        next();
        const inner = parseUnary();
        return { ev: () => -inner.ev() };
      }
      if (peek().t === TOK.OP && peek().v === '+') {
        next();
        return parseUnary();
      }
      return parsePow();
    }
    function parsePow() {
      let left = parsePostfix();
      if (peek().t === TOK.OP && peek().v === '**') {
        next();
        const right = parseUnary();
        const l = left;
        return { ev: () => Math.pow(l.ev(), right.ev()) };
      }
      return left;
    }
    function parsePostfix() {
      let node = parseAtom();
      while (true) {
        const tok = peek();
        if (tok.t === TOK.LP) { // call
          next();
          const args = [];
          if (peek().t !== TOK.RP) {
            args.push(parseExpr());
            while (peek().t === TOK.COMMA) { next(); args.push(parseExpr()); }
          }
          expect(TOK.RP);
          const callee = node;
          node = { ev: () => callFunc(callee.ev(), args.map(a => a.ev()), env) };
        } else if (tok.t === TOK.LB) { // subscript
          next();
          const idx = parseExpr();
          expect(TOK.RB);
          const base = node;
          node = { ev: () => getItem(base.ev(), idx.ev()) };
        } else if (tok.t === TOK.DOT) { // attribute
          next();
          const nameTok = expect(TOK.IDENT);
          const name = nameTok.v;
          const base = node;
          node = { ev: () => getAttr(base.ev(), name, env) };
        } else break;
      }
      return node;
    }
    function parseAtom() {
      const tok = next();
      switch (tok.t) {
        case TOK.NUM: return { ev: () => tok.v };
        case TOK.STR: return { ev: () => tok.v };
        case TOK.KW:
          if (tok.v === 'True') return { ev: () => true };
          if (tok.v === 'False') return { ev: () => false };
          if (tok.v === 'None') return { ev: () => null };
          throw new Error('意外的关键字: ' + tok.v);
        case TOK.LP: {
          const inner = parseExpr();
          expect(TOK.RP);
          return inner;
        }
        case TOK.LB: { // list literal
          const items = [];
          if (peek().t !== TOK.RB) {
            items.push(parseExpr());
            while (peek().t === TOK.COMMA) { next(); items.push(parseExpr()); }
          }
          expect(TOK.RB);
          return { ev: () => items.map(x => x.ev()) };
        }
        case TOK.LC: { // dict literal
          const pairs = [];
          if (peek().t !== TOK.RC) {
            let k = parseExpr();
            expect(TOK.COLON);
            let v = parseExpr();
            pairs.push([k, v]);
            while (peek().t === TOK.COMMA) { next(); k = parseExpr(); expect(TOK.COLON); v = parseExpr(); pairs.push([k, v]); }
          }
          expect(TOK.RC);
          return { ev: () => { const o = {}; for (const [k, v] of pairs) o[String(k.ev())] = v.ev(); return o; } };
        }
        case TOK.IDENT: return { ev: () => resolveName(tok.v, env) };
        default: throw new Error('意外的记号: ' + tok.v);
      }
    }
    function getItem(base, idx) {
      if (base === null || base === undefined) return undefined;
      if (typeof base === 'string') return base[Math.floor(idx)];
      return base[idx];
    }
    function getAttr(base, name, env) {
      if (base && typeof base === 'object' && name in base) return base[name];
      if (base === null || base === undefined) return undefined;
      if (typeof base === 'string') {
        const m = { upper: () => base.toUpperCase(), lower: () => base.toLowerCase(), strip: () => base.trim(), lstrip: () => base.replace(/^\s+/, ''), rstrip: () => base.replace(/\s+$/, ''), split: (sep) => sep ? base.split(sep) : base.split(/\s+/), replace: (o, nw) => base.split(o).join(nw), startswith: (p) => base.startsWith(p), endswith: (s) => base.endsWith(s), find: (sub) => base.indexOf(sub), count: (sub) => base.split(sub).length - 1, isdigit: () => /^\d+$/.test(base), isalpha: () => /^[A-Za-z]+$/.test(base), isalnum: () => /^[A-Za-z0-9]+$/.test(base), isspace: () => /^\s+$/.test(base), capitalize: () => base.charAt(0).toUpperCase() + base.slice(1).toLowerCase(), title: () => base.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase()) };
        if (name in m) return m[name]();
      }
      if (Array.isArray(base)) {
        const m = { append: (v) => { base.push(v); }, extend: (arr) => { for (const x of arr || []) base.push(x); }, insert: (i, v) => base.splice(i, 0, v), remove: (v) => { const i = base.findIndex(x => pyEq(x, v)); if (i >= 0) base.splice(i, 1); }, pop: (i) => base.splice(i === undefined ? base.length - 1 : i, 1)[0], sort: () => base.sort(), reverse: () => base.reverse(), count: (v) => base.filter(x => pyEq(x, v)).length, index: (v) => base.findIndex(x => pyEq(x, v)) };
        if (name in m) return m[name];
        if (name === 'copy') return () => deepClone(base);
        if (name === 'clear') return () => { base.length = 0; };
      }
      if (base && typeof base === 'object') {
        const m = { get: (k, d) => (k in base ? base[k] : (d === undefined ? null : d)), keys: () => Object.keys(base), values: () => Object.values(base), items: () => Object.entries(base), pop: (k, d) => { if (k in base) { const v = base[k]; delete base[k]; return v; } return d === undefined ? null : d; }, update: (o) => { Object.assign(base, o); }, clear: () => { for (const k of Object.keys(base)) delete base[k]; }, copy: () => deepClone(base), setdefault: (k, d) => { if (!(k in base)) base[k] = d === undefined ? null : d; return base[k]; } };
        if (name in m) return m[name];
      }
      return undefined;
    }
    function resolveName(name, env) {
      if (name === 'state') return env.state;
      if (name in env.helpers) return env.helpers[name];
      if (name in env.state) return env.state[name];
      return undefined;
    }
    function callFunc(callee, args, env) {
      if (typeof callee !== 'function') throw new Error('不可调用的对象: ' + callee);
      return callee.apply(null, args);
    }
    function evaluate() { return parseExpr().ev(); }

    return { evaluate, ast: parseExpr };
  }

  /* 内置函数集合 */
  function makeBuiltins(env) {
    const st = () => env.state;
    return {
      len: (x) => x === null || x === undefined ? 0 : (typeof x === 'string' ? x.length : (Array.isArray(x) ? x.length : (typeof x === 'object' ? Object.keys(x).length : 0))),
      abs: (x) => Math.abs(x),
      min: (...a) => Array.isArray(a[0]) ? Math.min(...a[0].filter(isNum)) : Math.min(...a.filter(isNum)),
      max: (...a) => Array.isArray(a[0]) ? Math.max(...a[0].filter(isNum)) : Math.max(...a.filter(isNum)),
      sum: (x) => (x || []).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0),
      round: (x, n) => { const p = Math.pow(10, n === undefined ? 0 : n); return Math.round(x * p) / p; },
      str: (x) => x === null ? 'None' : String(x),
      int: (x) => parseInt(x, 10),
      float: (x) => parseFloat(x),
      bool: (x) => pyTruthy(x),
      sorted: (x, rev) => { const arr = (x || []).slice().sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)); return rev ? arr.reverse() : arr; },
      list: (x) => x === null || x === undefined ? [] : Array.from(x),
      tuple: (x) => x === null || x === undefined ? [] : Array.from(x),
      dict: (x) => { const o = {}; if (x) for (const [k, v] of Array.from(x)) o[k] = v; return o; },
      set: (x) => { const s = []; for (const v of (x || [])) if (!s.some(y => pyEq(y, v))) s.push(v); return s; },
      any: (x) => (x || []).some(pyTruthy),
      all: (x) => (x || []).every(pyTruthy),
      isinstance: (x, t) => t === 'list' ? Array.isArray(x) : t === 'str' ? typeof x === 'string' : t === 'int' ? typeof x === 'number' && Number.isInteger(x) : t === 'float' ? typeof x === 'number' : t === 'bool' ? typeof x === 'boolean' : t === 'dict' ? (x !== null && typeof x === 'object' && !Array.isArray(x)) : t === 'None' ? x === null : true,
      hasattr: (x, a) => x !== null && x !== undefined && (a in Object(x)),
      type: (x) => x === null ? 'NoneType' : Array.isArray(x) ? 'list' : typeof x,
      range: (...a) => { let start = 0, stop, step = 1; if (a.length === 1) stop = a[0]; else { start = a[0]; stop = a[1]; if (a.length === 3) step = a[2]; } const out = []; for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i); return out; },
      enumerate: (x, s) => (x || []).map((v, i) => [i + (s || 0), v]),
      zip: (...arrs) => { const n = Math.min(...arrs.map(a => a.length)); const out = []; for (let i = 0; i < n; i++) out.push(arrs.map(a => a[i])); return out; },
      map: (f, x) => (x || []).map(v => typeof f === 'function' ? f(v) : v),
      filter: (f, x) => (x || []).filter(v => typeof f === 'function' ? pyTruthy(f(v)) : true),
      print: (...a) => { (env.log || console.log)('[print] ' + a.map(x => JSON.stringify(x)).join(' ')); return null; },
      float_inf: Infinity
    };
  }

  function evalCondition(expr, state, opts) {
    opts = opts || {};
    const env = { state: state, log: opts.log || null, helpers: makeBuiltins({ state: state, log: opts.log || null }) };
    try {
      const p = new Parser(expr, env);
      const v = p.evaluate();
      return { ok: true, value: pyTruthy(v), raw: v };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ---------------- 原子(port)执行 ---------------- */
  function resolveInput(name, port, params, state) {
    if (params && name in params) {
      let raw = params[name];
      raw = String(raw).trim();
      if (raw === 'state') return { type: 'state', value: state };
      // state['x'] / state.get('x') / state.x 引用 → 取状态字段
      const m1 = raw.match(/^state\[['"]([^'"]+)['"]\]$/);
      const m2 = raw.match(/^state\.get\(['"]([^'"]+)['"]\s*(?:,\s*([^)]*))?\)$/);
      const m3 = raw.match(/^state\.([A-Za-z_][A-Za-z0-9_]*)$/);
      if (m1) return { type: 'field', value: state[m1[1]] };
      if (m3) return { type: 'field', value: state[m3[1]] };
      if (m2) return { type: 'field', value: (m2[1] in state ? state[m2[1]] : (m2[2] ? pyLiteral(m2[2]) : null)) };
      // 字面量
      const lit = pyLiteral(raw);
      if (typeof lit !== 'string' || /^['"\[\{]/.test(raw) || /^(True|False|None)$/.test(raw)) {
        return { type: 'literal', value: lit };
      }
      // 表达式求值（如 state['a'] + state['b']）
      const ev = evalCondition(raw, state, {});
      if (ev.ok && ev.raw !== undefined && ev.raw !== raw) {
        return { type: 'expr', value: ev.raw };
      }
      return { type: 'literal', value: lit };
    }
    // 默认值
    const def = port.inputs && port.inputs.find(i => i.name === name);
    if (def) {
      if (def.default === 'state') return { type: 'state' };
      return { type: 'literal', value: pyLiteral(String(def.default)) };
    }
    // 同名状态字段
    if (name in state) return { type: 'field', value: state[name] };
    return { type: 'literal', value: undefined };
  }

  function pyLiteral(raw) {
    const s = String(raw).trim();
    if (s === 'True') return true;
    if (s === 'False') return false;
    if (s === 'None' || s === '') return null;
    if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
    if (/^[+-]?\d*\.\d+$/.test(s) || /^[+-]?\d+[eE][+-]?\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
    // JSON-ish array
    if (s.startsWith('[') && s.endsWith(']')) { try { return JSON.parse(s); } catch (e) {} }
    if (s.startsWith('{') && s.endsWith('}')) { try { return JSON.parse(s.replace(/'/g, '"')); } catch (e) {} }
    return s;
  }

  function extractFieldName(raw, state) {
    const s = String(raw || '').trim();
    let m = s.match(/^state\[['"]([^'"]+)['"]\]$/);
    if (m) return m[1];
    m = s.match(/^state\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (m) return m[1];
    return s;
  }

  function execAtom(atom, params, state, opts) {
    opts = opts || {};
    const log = opts.log || null;
    const port = atom.port || {};
    const kind = port.kind || 'unsupported';
    params = params || {};
    const stateBefore = deepClone(state);
    if (kind === 'unsupported') {
      return { ok: false, error: '原子 ' + atom.id + ' 无便携语义(port)，请按 通用文件1 的接口补充其 port 语义', code: 'unsupported' };
    }
    if (kind === 'noop') {
      if (log) log('[原子] ' + atom.id + ' 无副作用(noop)');
      return { ok: true, changed: [] };
    }
    if (kind === 'log') {
      const tpl = port.template || '';
      const parts = tpl.split('{{').map((x, i) => i % 2 === 1 ? String(resolveInput(x.split('}}')[0].trim(), port, params, state).value) : x).join('');
      if (log) log('[打印] ' + parts);
      return { ok: true, changed: [] };
    }
    try {
      const helpers = makeBuiltins({ state: state, log: log || null });
      if (kind === 'direct' || kind === 'direct_mutate') {
        const args = {};
        for (const inp of (port.inputs || [])) {
          args[inp.name] = resolveInput(inp.name, port, params, state).value;
        }
        const fn = new Function('state', 'helpers', 'inputs', port.js);
        fn(state, helpers, args);
        const changed = diffState(stateBefore, state);
        return { ok: true, changed: changed };
      }
      if (kind === 'swap') {
        const fa = extractFieldName(params.a, state);
        const fb = extractFieldName(params.b, state);
        if (fa in state || fb in state) {
          const t = state[fa]; state[fa] = state[fb]; state[fb] = t;
          return { ok: true, changed: [{ key: fa, value: deepClone(state[fa]) }, { key: fb, value: deepClone(state[fb]) }] };
        }
        return { ok: true, changed: [] };
      }
      if (kind === 'delete') {
        const target = port.target || 'value';
        const raw = params[target] !== undefined ? params[target] : (port.inputs || []).find(i => i.name === target) ? (port.inputs || []).find(i => i.name === target).default : '';
        const m = extractFieldName(raw, state);
        if (m in state) { delete state[m]; return { ok: true, changed: [{ key: m, value: null, deleted: true }] }; }
        return { ok: true, changed: [] };
      }
      // compute / assign / mutate: 解析输入 → 调用 js
      const args = {};
      for (const inp of (port.inputs || [])) {
        args[inp.name] = resolveInput(inp.name, port, params, state).value;
      }
      const fn = new Function('state', 'helpers', 'inputs',
        'var f = (function(' + (port.params || []).join(',') + '){ ' + port.js + ' });' +
        'return f.apply(null, (' + JSON.stringify((port.params || [])) + ').map(function(p){ return inputs[p]; }));');
      if (kind === 'compute') {
        const result = fn(state, helpers, args);
        const output = params.output !== undefined ? String(params.output) : port.output;
        if (output) {
          state[output] = deepClone(result);
          return { ok: true, changed: [{ key: output, value: deepClone(result) }] };
        }
        return { ok: true, changed: [] };
      }
      if (kind === 'mutate') {
        fn(state, helpers, args);
        const changed = diffState(stateBefore, state);
        return { ok: true, changed: changed };
      }
      return { ok: true, changed: [] };
    } catch (e) {
      return { ok: false, error: '原子 ' + atom.id + ' 执行失败: ' + e.message, code: 'exec_error' };
    }
  }

  function diffState(before, after) {
    const keys = new Set(Object.keys(before).concat(Object.keys(after)));
    const changed = [];
    for (const k of keys) {
      if (!(k in before)) changed.push({ key: k, value: deepClone(after[k]) });
      else if (!(k in after)) changed.push({ key: k, value: null, deleted: true });
      else if (!pyEq(before[k], after[k])) changed.push({ key: k, value: deepClone(after[k]) });
    }
    return changed;
  }

  function collectWrites(keys, state) {
    const out = {};
    for (const k of (keys || [])) out[k] = deepClone(state[k]);
    return out;
  }

  /* ---------------- 前向链运行 ---------------- */
  function normalizeActions(rule) {
    if (Array.isArray(rule.actions) && rule.actions.length) {
      return rule.actions.map(a => {
        if (typeof a === 'string') return { atom_id: a, params: {} };
        return { atom_id: a.atom_id, params: a.params || {}, output: a.output };
      });
    }
    const ids = String(rule.action || '').split(',').map(s => s.trim()).filter(Boolean);
    return ids.map(id => ({ atom_id: id, params: rule.params || {}, output: rule.output }));
  }

  function runChain(opts) {
    // opts: { rules: [...], atoms: {id: atom}, initial_state: {...}, max_iter: n, log: fn }
    const rules = (opts.rules || []).slice().sort((a, b) => (a.priority || 100) - (b.priority || 100));
    const atoms = opts.atoms || {};
    const state = deepClone(opts.initial_state || {});
    const maxIter = opts.max_iter || 50;
    const log = opts.log || null;
    const steps = [];
    const events = [];
    let iteration = 0;
    let reason = 'no_candidates';
    let stable = new Set();

    function changedFields(changes) {
      const s = new Set();
      for (const c of changes || []) s.add(c.key);
      return s;
    }

    while (iteration < maxIter) {
      iteration++;
      if (log) log('— 第 ' + iteration + ' 轮 —');
      let picked = null;
      for (const rule of rules) {
        if (stable.has(rule.rule_id)) continue;
        const res = evalCondition(rule.condition || '', state, { log: log });
        if (!res.ok) {
          events.push({ iteration: iteration, kind: 'condition_error', rule_id: rule.rule_id, error: res.error });
          if (log) log('  规则 ' + rule.rule_id + ' 条件解析失败: ' + res.error);
          continue;
        }
        if (res.value) { picked = rule; break; }
      }
      if (!picked) {
        reason = 'no_match';
        break;
      }
      const stateBefore = deepClone(state);
      const actionList = normalizeActions(picked);
      const changes = [];
      let anyError = false;
      for (const act of actionList) {
        const aid = act.atom_id;
        const atom = atoms[aid];
        if (!atom) {
          events.push({ iteration: iteration, kind: 'action_error', rule_id: picked.rule_id, code_id: aid, error: '未知原子 ' + aid });
          if (log) log('  动作 ' + aid + ' 未找到原子');
          anyError = true;
          continue;
        }
        const actParams = Object.assign({}, act.params || {});
        if (act.output) actParams.output = act.output;
        const res = execAtom(atom, actParams, state, { log: log });
        if (!res.ok) {
          events.push({ iteration: iteration, kind: 'action_error', rule_id: picked.rule_id, code_id: aid, error: res.error });
          if (log) log('  动作 ' + aid + ' 失败: ' + res.error);
          anyError = true;
          continue;
        }
        for (const c of (res.changed || [])) changes.push(Object.assign({}, c, { atom_id: aid }));
      }
      const stateAfter = deepClone(state);
      const fields = changedFields(changes);
      steps.push({
        iteration: iteration,
        rule_id: picked.rule_id,
        group: picked.group || 'default',
        priority: picked.priority || 100,
        condition: picked.condition,
        condition_result: true,
        action_ids: actionList.map(a => a.atom_id),
        changes: changes,
        changed_fields: Array.from(fields),
        state_before: stateBefore,
        state_after: stateAfter
      });
      events.push({ iteration: iteration, kind: 'rule_fire', rule_id: picked.rule_id, action_ids: actionList.map(a => a.atom_id), changed_fields: Array.from(fields) });
      if (log) log('  触发规则 ' + picked.rule_id + ' 动作[' + actionList.map(a => a.atom_id).join(',') + '] 变更字段 {' + Array.from(fields).join(',') + '}');
      if (fields.size === 0 && !anyError) {
        stable.add(picked.rule_id);
      } else {
        stable.clear();
      }
    }
    if (iteration >= maxIter) reason = 'max_iter';
    return {
      final_state: state,
      steps: steps,
      events: events,
      iterations: iteration,
      fires: steps.length,
      stopped_reason: reason
    };
  }

  /* 确定性随机（mulberry32） */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  
  /* 只解析条件，不求值：供校验器使用 */
  function parseCondition(expr) {
    try {
      const env = { state: {}, log: null, helpers: makeBuiltins({ state: {}, log: null }) };
      const p = new Parser(String(expr || ''), env);
      p.ast();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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
    mulberry32,
    makeBuiltins
  };
