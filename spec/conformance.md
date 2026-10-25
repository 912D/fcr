# 一致性测试清单（Conformance）

> 声明"兼容 FCR format v1.0"的实现，必须通过下列测试。
> 参考命令：`node --test`（在仓库根目录运行；零依赖，Node ≥ 18）。

## 必须通过

| # | 测试 | 判据 |
|---|---|---|
| C1 | `validate` 通过所有随仓库发布的包 | 退出码 0，0 error |
| C2 | 空状态运行六问包 | `verdict = "信息不足：先补六问"`，`missing_inputs` 长度 = 8 |
| C3 | 示例三条数据运行 | 结论分别与 `data.example.json` 的 `_expected.verdict` 一致 |
| C4 | 确定性 | 同输入运行两次，`final_state` 深相等，`steps` 长度相等 |
| C5 | 优先级 | `steps[0].priority` 等于全部命中规则中的最小值 |
| C6 | 轨迹完整 | 每个 `steps[i].changed_fields` 中的字段都在 `changes` 中出现；`fires == steps.length` |
| C7 | 幂等 | 对同一输入重复运行，`append_once` 不产生重复项 |
| C8 | 守卫 | 示例数据运行不出现 `stopped_reason = "max_iter"` |
| C9 | legacy 兼容 | 旧格式包（无 `format` 字段）可直接运行，结论一致 |
| C10 | 解释可读 | `explain` 输出包含每条触发规则的 `rule_id` 与字段变更 |

## 由校验器强制（error）

- `params.key` 未加引号；
- `set_field` 无守卫；
- 条件解析失败；
- `rule_id` 重复；
- 原子不在内建集合内。

## 不做强制（warning）

- 条件引用未声明字段；
- 多条规则写同一标量；
- 缺 `evidence`；
- `heuristic` 未标"未校准"。

## 如何声明兼容

在 README 里写：

```markdown
Conforms to FCR format v1.0 (see spec/conformance.md). Tested with FCR 1.0.0 on Node 20.
```
