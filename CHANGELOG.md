# 变更记录

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [1.0.0] - 2026-10-25

### 新增

- 规则包格式 `fcr/rulepack` v1：`spec/00-格式规范.md`、`spec/rulepack.schema.json`、`spec/conformance.md`；
- 参考实现：`core/engine.mjs`（前向链引擎，语义冻结）、`core/atoms.mjs`（3 个内建原子）、`core/index.mjs`；
- 无头 CLI：`cli/fcr.mjs`，子命令 `run` / `validate` / `explain` / `schema` / `packs`；
- 领域规则包：
  - `packs/sci-ml-six-questions/`：科研 ML 六问，39 条（缺项 8 / 红旗 18 / 候选 10 / 结论 3）；
  - `packs/battery-ml/`：电池方向草案（含删失、协议不可比、SOH 目标泄漏等），标注"未校准"；
  - `packs/template/`：空白模板与写作检查清单；
- 一致性测试：`tests/conformance.test.mjs`（零依赖，`node --test`）；
- 文档：`docs/设计说明.md`、`docs/限制与失效模式.md`、`docs/如何写规则包.md`。

### 备注

- 引擎移植自作者内部实现（JS，683 行），语义未改；
- 条件表达式保留 Python 风味子集（`state.get('x')`、`and/or/not/in/is`），非 JS 语法；
- 旧格式规则包（无 `format` 字段）可直接读取。
