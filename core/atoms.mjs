/* FCR 内建原子（v1）
 *
 * 三个原子是规则包里唯一可执行的写入语义；语义定义见 spec/00-格式规范.md §5。
 * params 的值一律是字符串，由 core/engine.mjs 的 resolveInput 解析：
 *   "state.get('x')" / "state['x']" / "state.x"  -> 字段引用
 *   "'text'"                                    -> 字符串字面量
 *   "123" / "True" / "None"                     -> 对应字面量
 */

export const ATOMS = {
  set_field: {
    id: 'set_field',
    port: {
      kind: 'direct_mutate',
      inputs: [{ name: 'key' }, { name: 'value' }],
      js: 'state[inputs.key]=inputs.value;'
    }
  },
  set_default: {
    id: 'set_default',
    port: {
      kind: 'direct_mutate',
      inputs: [{ name: 'key' }, { name: 'value' }],
      js: 'if(state[inputs.key]===undefined||state[inputs.key]===null||state[inputs.key]===""||(Array.isArray(state[inputs.key])&&state[inputs.key].length===0)){state[inputs.key]=inputs.value;}'
    }
  },
  append_once: {
    id: 'append_once',
    port: {
      kind: 'direct_mutate',
      inputs: [{ name: 'key' }, { name: 'value' }],
      js: 'var k=inputs.key; if(!Array.isArray(state[k])) state[k]=[]; if(!state[k].includes(inputs.value)) state[k].push(inputs.value);'
    }
  }
};

export const ATOM_IDS = Object.keys(ATOMS);
