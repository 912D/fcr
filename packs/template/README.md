# 空白规则包模板

复制本目录为 `packs/<你的领域>/`，改 `pack.json` 与 `data.example.json`。

## 五步

1. **定字段**：写下你要诊断的输入（每个字段给 `type`，枚举给 `values`）；
2. **定缺项**：每个必填字段一条 `missing` 规则（priority 1–9）；
3. **定红旗**：每条红旗对应一个**已知失效模式**，并在 `evidence` 里写清来源等级；
4. **定候选**：`candidate`（priority 60–69）只给"族"，不给排行榜；
5. **定结论**：`verdict`（priority 90–99）按"缺项 → 红旗 → 可进入"的顺序三条。

## 自检

```bash
node cli/fcr.mjs validate packs/<你的领域>/pack.json
node cli/fcr.mjs run --pack packs/<你的领域>/pack.json --data packs/<你的领域>/data.example.json
node --test
```

## 三条硬约束

- 写标量用 `set_field` 时必须带守卫（`state.get('字段') is None`），否则会跑到 `max_iter`；
- 列表用 `append_once`（幂等）；
- `params.key` 必须带引号：`"'red_flags'"`。

详见 [../../docs/如何写规则包.md](../../docs/如何写规则包.md) 与 [../../spec/00-格式规范.md](../../spec/00-格式规范.md)。
