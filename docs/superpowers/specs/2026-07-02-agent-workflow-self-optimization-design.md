# Agent 工作流自我优化设计

**日期**: 2026-07-02  
**状态**: 设计完成  
**目标**: 确保 AI 助手在每次任务中系统性地调用四个核心技能，并完成 Git 推送收尾

---

## 1. 问题背景

AI 助手在当前 workflow 中存在两个反复出现的问题：

1. **Skill 调用遗漏**：用户要求每次任务使用 brainstorming、frontend-design、react-best-practices、self-evolving-core 四个技能，但 AI 助手经常只调用其中一两个
2. **Git 推送遗漏**：代码修改完成并通过验证后，忘记执行 git commit + git push

用户已多次提醒，需要建立系统性机制确保不再重复。

---

## 2. 整体架构

两层设计，各司其职：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: 任务执行清单 (流程约束)                      │
│                                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │ 启动阶段  │ → │ 执行阶段  │ → │    收尾阶段       │ │
│  │           │   │           │   │                   │ │
│  │ ① 并行加载│   │ 按brain-  │   │ ① tsc --noEmit   │ │
│  │   4个Skill│   │ storming  │   │ ② Playwright验证  │ │
│  │ ② Router  │   │ 流程执行  │   │ ③ git commit      │ │
│  │   签到    │   │           │   │ ④ git push        │ │
│  └──────────┘   └──────────┘   │ ⑤ evolution log   │ │
│                                 └──────────────────┘ │
├─────────────────────────────────────────────────────┤
│  Layer 2: 自进化兜底 (元层面强制)                      │
│                                                       │
│  MEMORY.md PINNED区  ←→  immune_rules.json           │
│  (硬性纪律锚点)           (critical级别拦截)           │
│                                                       │
│  Router 每次任务前预检 → 缺失 Skill 调用 → 拦截提醒     │
│  任务结束 log 自动记账 → 每3次 auto-review 提取经验     │
└─────────────────────────────────────────────────────┘
```

---

## 3. 具体修改

### 3.1 MEMORY.md — PINNED 区新增技能调用纪律

在 `<!-- PINNED_SECTION_END -->` 之前插入：

```markdown
🔴 技能调用纪律（P0 — 每次任务强制执行）
  每次收到用户任务后，第一步必须并行调用四个 Skill：
    - Skill: brainstorming        → 设计前思考
    - Skill: frontend-design       → UI 审美指导
    - Skill: vercel-react-best-practices → React 性能规则
    - Skill: self-evolving-core    → 自进化记账
  第二步：调用 Router 签到
    python3 domains/_shared/domain_router.py "<任务描述>"
  任务完成后必须执行收尾五项：
    tsc --noEmit → Playwright → git commit → git push → evolution log
```

### 3.2 immune_rules.json — 新增 critical 规则

在 `domains/taskflow/immune_rules.json` 中新增：

```json
{
  "id": "rule_skill_discipline",
  "scenario": "跳过任务启动时的 Skill 并行加载",
  "rule": "Router 检测到未调用 Skill 工具 → 拦截并提醒：必须先加载 4 个 Skill",
  "severity": "critical",
  "source_lesson": "用户多次指出遗漏 Skill 调用和 Git 推送",
  "error_category": "discipline"
}
```

### 3.3 taskflow 域 — 经验库补充

将本次「自我优化设计」写入 `domains/taskflow/experiences.json`，作为 L2 程序性经验。

---

## 4. 执行保障（三层递进）

| 保障层 | 机制 | 触发条件 |
|--------|------|---------|
| 保障 1 | 会话启动时读取 MEMORY.md PINNED 区 | 每次新会话 |
| 保障 2 | Router 硬拦截 — critical 规则拒绝执行 | 任务前预检发现缺失 Skill |
| 保障 3 | 自进化升级 — 遗漏次数越多规则越严 | auto-review 检测到遗漏 |

### 自进化升级阶梯

| 遗漏次数 | immune_rules 级别 | 行为 |
|---------|-------------------|------|
| 1 次 | warning | 提醒 |
| 2 次 | critical | 硬拦截 |
| 3+ 次 | critical + 升级 MEMORY.md 到 P0 | 全链路阻断 |

---

## 5. 任务执行清单（完整流程）

```
┌─ 启动阶段 ─────────────────────────────────────┐
│ 1. 并行调用 4 个 Skill                          │
│    Skill("brainstorming")                       │
│    Skill("frontend-design")                     │
│    Skill("vercel-react-best-practices")          │
│    Skill("self-evolving-core")                  │
│ 2. 调用 Router 签到                             │
│    python3 domains/_shared/domain_router.py ".." │
│ 3. Read MEMORY.md 确认纪律                      │
├─ 执行阶段 ─────────────────────────────────────┤
│ 4. 按 brainstorming 流程执行任务                 │
│    - 如果是 UI 相关 → 遵循 frontend-design 指导   │
│    - 如果是 React 代码 → 遵循 react-best-practices │
├─ 收尾阶段 ─────────────────────────────────────┤
│ 5. TypeScript 检查                              │
│    npx tsc --noEmit                             │
│ 6. Playwright 验证                              │
│ 7. Git 提交                                     │
│    git add <files> && git commit -m "..."        │
│ 8. Git 推送                                     │
│    git push                                     │
│ 9. 自进化记账                                   │
│    python3 domains/_shared/evolution_guardian.py │
│      log taskflow "<任务>" success/failed        │
└─────────────────────────────────────────────────┘
```

---

## 6. 范围与约束

- **只修改配置/文档文件**：MEMORY.md、immune_rules.json、experiences.json
- **不修改源码**：domain_router.py、evolution_guardian.py 等已有功能无需改动
- **不新增脚本**：利用现有自进化基础设施
- **生效时间**：下次会话 Router 加载 immune_rules 时自动生效

---

## 7. 自审

- [x] 无 TBD/TODO 占位符
- [x] 架构与功能描述一致（两层：清单 + 兜底）
- [x] 范围聚焦，不涉及项目源码修改
- [x] 无歧义：每个步骤有明确的工具调用或命令