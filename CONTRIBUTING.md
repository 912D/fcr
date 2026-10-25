# 贡献说明

## 支持承诺

**本项目不提供支持。** 这是长周期个人项目的公开产物：代码与格式按"现状"提供，不保证响应 issue、不保证修复时间、不保证向后兼容之外的任何承诺。用之前请先读 [docs/限制与失效模式.md](docs/限制与失效模式.md)。

## 收什么

| 类型 | 要求 |
|---|---|
| **新的领域规则包** | 必须是 `packs/` 下的独立目录；`validate` 零错误；每条规则带 `evidence`；附一个能触发它的示例数据 |
| **格式/校验器/CLI 的缺陷修复** | 附最小复现；不引入第三方依赖 |
| **文档纠错** | 直接 PR |

## 不收什么

- 模型推荐、排行榜、自动调参；
- 网络服务、遥测、上传；
- 新的运行时依赖（保持零依赖：只用 Node 标准库）；
- 改变引擎语义的改动（排序、单轮单条命中、stable 集、`max_iter`）——这些属于 `format_version` 变更，需要先开 issue 讨论。

## 规则包的最低要求

1. **字段字典齐全**：`fields` 里每个被条件引用的字段都要声明 `type`，枚举要给 `values`；
2. **守卫**：写标量字段的动作（`set_field`）必须在条件里包含 `state.get('<目标字段>') is None` 之类的守卫，否则会反复触发到 `max_iter`；
3. **幂等**：列表写入用 `append_once`，标量默认值用 `set_default`；
4. **引号**：`params.key` 必须写成带引号的字符串（如 `"'red_flags'"`），否则会被当作字段引用；
5. **证据**：`evidence.kind` 必须是 `heuristic` / `standard` / `literature` / `calibration` 之一；`heuristic` 必须写明"未校准"；
6. **一致性**：`node --test`（仓库根目录）必须全绿，且新包要被 `tests/` 自动纳入校验。

## 提交前自检

```bash
node cli/fcr.mjs validate packs/<你的包>/pack.json
node --test
```

## 许可

贡献即表示同意以 MIT 许可发布。
