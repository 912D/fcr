# FCR · 科研 ML 前置校验的前向链规则引擎

> **规则包格式 + 参考实现 + 领域规则包。** 用确定性规则检查"这个科研建模任务在方法上站不站得住"，而不是替你选模型。
>
> 定位：**检查表，不是神谕。** 它只回答三件事——缺什么、有什么红旗、先做哪一步。

## 这是什么

科研里最常见的浪费，不是模型不够强，而是**在问题没定义清楚时就开跑**：样本单位不明、同源泄漏、指标配错任务、小样本上大模型、交付要求与模型能力不匹配。这些问题在任何训练开始之前就能被检查出来，但没有人把它做成可执行的流程。

FCR 把这个流程做成三件东西：

1. **一个格式**（`fcr/rulepack` v1）：规则是数据，不是代码；可版本化、可审计、可替换；
2. **一个参考实现**（无依赖的 JS 引擎 + 无头 CLI）：确定性裁决，同一输入永远同一输出，每条结论可追到"哪条规则、把哪个字段从什么改成了什么"；
3. **若干领域规则包**：科研 ML 六问（39 条）、电池方向（草案）、空白模板。

## 它不是什么

- 不是模型推荐器，不给排行榜；
- 不是自动决策器，红旗是启发式，**不替代验证**；
- 不是平台/服务，不联网、不上传、无后端；
- 不是 LLM 应用：LLM 只用来**起草**规则，裁决永远由确定性引擎做。

## 快速开始

需要 Node.js ≥ 18，无第三方依赖。

```bash
# 1) 跑一遍示例（3 个科研案例）
node cli/fcr.mjs run \
  --pack packs/sci-ml-six-questions/pack.json \
  --data packs/sci-ml-six-questions/data.example.json

# 2) 单条案例 + JSON 输出（便于流水线）
node cli/fcr.mjs run --pack packs/sci-ml-six-questions/pack.json \
  --data packs/sci-ml-six-questions/data.example.json --case 0 --json

# 3) 看轨迹：哪条规则、把哪个字段从什么改成什么
node cli/fcr.mjs explain --pack packs/sci-ml-six-questions/pack.json \
  --data packs/sci-ml-six-questions/data.example.json --case 0

# 4) 校验你自己的规则包（退出码 0=通过）
node cli/fcr.mjs validate packs/sci-ml-six-questions/pack.json

# 5) 打印随仓库发布的 JSON Schema
node cli/fcr.mjs schema
```

`run` 的输出字段：`verdict` / `next_action` / `red_flags` / `required_checks` / `candidate_families` / `missing_inputs`，以及 `iterations` / `fires` / `stopped_reason`。

## 规则包长什么样

```json
{
  "format": "fcr/rulepack",
  "format_version": "1.0",
  "id": "sci-ml-six-questions",
  "version": "1.0.0",
  "title": "科研 ML 六问前置校验",
  "fields": {
    "goal_type": { "type": "enum", "values": ["regression", "classification", "ranking"], "description": "科学目标与任务类型" }
  },
  "rules": [
    {
      "rule_id": "R22",
      "priority": 22,
      "group": "red",
      "condition": "state.get('leakage') is not None and 'same_system' in state.get('leakage')",
      "description": "同体系样本跨训练与测试：指标可能是同源泄漏",
      "evidence": { "kind": "literature", "source": "Kapoor & Narayanan 2023; Kaufman et al. 2012" },
      "actions": [
        { "atom_id": "append_once", "params": { "key": "'red_flags'", "value": "'同一体系/成分族样本跨集：指标可能是同源泄漏'" } }
      ]
    }
  ]
}
```

规则按 `priority` 升序触发；每轮**只取第一条命中且未稳定的规则**；无变更则标记为稳定。因此一包里应当同时包含：缺项检查（1–9）→ 红旗（20–39）→ 候选（60–69）→ 结论（90–99）。

## 设计原则

1. **生成与裁决分离**：LLM 只起草规则文本，引擎做判定，校验器做检查。概率性生成不进入判定链。
2. **规则是数据**：改行为不改代码；包可被替换、被审计、被版本化。
3. **可追溯**：每一步记录规则 id、条件、动作与字段变更（`steps`）。
4. **证据可挂**：每条规则可带 `evidence`（`heuristic` / `standard` / `literature` / `calibration`）。**没有证据的规则只能算经验**，文档里必须这么标。

## 仓库结构

```
spec/     格式规范、JSON Schema、一致性测试清单
core/     引擎（无依赖 ESM）+ 内建原子
cli/      无头命令行：run / validate / explain / schema
packs/    领域规则包（科研六问 / 电池草案 / 空白模板）
tests/    一致性测试（node --test，无依赖）
docs/     设计说明、限制与失效模式、如何写规则包
```

## 兼容承诺

- `format_version: "1.0"` 冻结；新增字段向后兼容。
- 引擎语义（排序、单轮单条命中、stable 集、`max_iter` 截断）不再改动。
- 旧格式（无 `format` 字段、`rule_id` + `actions[].atom_id`）可直接读取（legacy 模式）。

## 贡献与支持

- **只收两类东西**：新的领域规则包（须带 `evidence` 与一致性用例）、格式/校验器的缺陷修复。
- 不收：模型排行榜、自动调参、第三方依赖、网络服务。
- **无支持承诺**：这是长周期个人项目的公开产物，不保证响应 issue。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 来源与致谢

- **磐石·科学智能（AI for Science）实训营（2026）**：作者观看了该营的公开课程视频（由中国科学院物理研究所等主办，2026 年 9 月 4–8 日；课程覆盖科研智能体、AI4S 科研方法论、科学模型与端到端科研闭环），并自行做了系统总结。本仓库"先检查研究前提、再谈模型"的组织方式，受该系列课程启发。
  课程页：<https://il.las.ac.cn/course/detail?id=c6e3f868fd60d838e045d099206d3363>
  **本仓库不是该实训营的成果，与主办方无隶属、赞助或背书关系；全部内容与结论由作者负责。**
- **前向链推理引擎（政务白箱计算）**：规则 JSON ＋ 确定性裁决 ＋ 轨迹留痕的原始设计，作者既有工作；本仓库在其基础上改造为通用规则包格式。
- **场论计算机 V1.0**：方法背景，Zenodo DOI: `10.5281/zenodo.23281147`（概念 DOI: `10.5281/zenodo.23281146`）。
- **作者 ORCID**：`0009-0008-2591-522X`

## 许可

MIT，见 [LICENSE](LICENSE)。

## 引用

若你在研究中使用本格式或规则包，建议引用仓库与版本号。仓库已提供 [`CITATION.cff`](CITATION.cff)（Zenodo 会自动读取）；DOI 待 Zenodo 归档后补入。
