# 长期记忆
<!-- PINNED_SECTION: 以下内容为绝对核心规范，高权重，永不被蒸馏删除 -->

## 🔴 沟通规范（绝对）
- （在此填写你与AI助手的沟通偏好，如语言风格、称呼等）

## 🔴 运行模式（绝对）
- **唯一模式**: Domain框架（`domains/`目录），所有自进化走`--domain {域名}`

## 🔴 核心操作纪律 P0
| 规则 | 一句话 |
|------|--------|
| **⚡自进化log（最重要）** | **每完成一个任务必须执行**: `python3 domains/_shared/evolution_guardian.py log <域> "<任务>" <success\|failed\|partial>` |
| Session启动 | 先载入MEMORY+daily log+domain经验→再工作 |

### ⚡ 自进化log触发条件（无例外）
做了以下任何一件事，结束前**必须执行log**：
- 写文件/改代码/跑命令/写文档/数据加工/决策记录
- 回答≥3条建议的问答/设计输出/修复错误/集成调用
- 单轮≥3个工具调用/创建或更新skill/任何用户可感知产出

**唯一豁免**：打招呼、单句确认、用户取消任务、询问时间路径

### 🚨 回复前强制自检（每次必做！）
**在写最终回复之前，必须问自己：**
```
□ 本轮是否有实质性工作产出？（写文件/跑命令/解决问题...）
□ 如果有 → 是否已执行 evolution_guardian.py log？
□ 如果没执行 → 立即执行，不要回复！
```
**违反此规则 = 自进化系统失明 = 经验无法积累**

### 📊 四条自动触发规则（log 内置阈值引擎自动检测）
| 规则 | 阈值 | 自动动作 |
|------|------|---------|
| R1 | 每 3 次任务 | 提示复盘 |
| R2 | 同类任务连续失败 ≥2 次 | 🔴 提示提取免疫规则 |
| R3 | 收到负面反馈 ≥1 条 | ⚠️ 提示深度进化 |
| R4 | MEMORY.md > 200 行 | 📋 提示 distill |

## 📌 记忆系统规则
- `MEMORY.md`：只存元层（规范/概览/指针），目标<200行
- `short-term-memory.md`：新内容写到顶部新内容区，`distill --from-stm`提炼
- `domains/*/experiences.json`：具体经验的最终归宿
- `YYYY-MM-DD.md`：当日日志，15天后归档到`archive/`
- **distill命令**：`python3 domains/_shared/evolution_guardian.py distill`

## 🔴 项目目录管理规则（绝对）

**每个项目启动时，必须在 `workspace/` 下创建中文命名的项目目录。**

| 规则 | 说明 |
|------|------|
| 目录命名 | **必须中文**，简洁明了 |
| 项目信息 | 状态、进度、待办、代码位置等**只存在项目目录内** |
| Memory职责 | **只存路径指针**，指向项目目录位置，绝不存项目具体内容 |
| 确保纯净 | Memory文件 = 规范 + 索引 + 指针，不是项目笔记本 |

## 🔴 技能调用纪律（P0 — 每次任务强制执行）

**每次收到用户任务后，第一步必须并行调用四个 Skill：**

| # | Skill | 用途 |
|---|-------|------|
| 1 | `Skill("brainstorming")` | 设计前思考，探索方案，获取批准后执行 |
| 2 | `Skill("frontend-design")` | UI 审美指导，避免通用 AI 风格 |
| 3 | `Skill("vercel-react-best-practices")` | React 性能规则（65 条），优化重渲染和 bundle |
| 4 | `Skill("self-evolving-core")` | 自进化记账，经验积累闭环 |

**任务完成后必须执行收尾清单：**
```
tsc --noEmit → Playwright 验证 → git commit → git push → evolution log
```

**遗漏后果：** 1 次 warning → 2 次 critical 硬拦截 → 3+ 次全链路阻断

<!-- PINNED_SECTION_END -->

---

## 📌 Domain框架
- 路由引擎：`domains/_shared/domain_router.py`
- 域列表：（由 `--deploy` 自动生成后在此补充）

## 📌 活跃项目索引（只存路径）

| 项目 | 目录 | 状态 |
|------|------|------|
| （示例）某项目 | `workspace/某项目/` | 进行中 |

---
*初始化时间: 2026-06-28（由 self-evolving-core v5.1.1 --deploy 自动创建）*
*完整经验详见 domains/*/experiences.json*
## 📌 self-evolving-core 记忆规则（由 --deploy 自动生成，2026-06-28）

### 域配置
- 当前域：docs / coding / log / domain
- 路由引擎：`domains/_shared/domain_router.py`
- 经验库：`domains/<域名>/experiences.json`（★ 具体经验存这里，不要存MEMORY.md）

### 记忆分层规则
- `MEMORY.md`（本文件）：**只存元层**——沟通规范、运行模式、架构概览、指针行
- `short-term-memory.md`：临时缓冲区，随时追加，`distill --from-stm` 提炼到本文件
- `domains/*/experiences.json`：具体操作经验、踩坑记录的最终归宿
- `YYYY-MM-DD.md`：当日工作日志，15天后自动归档到 `archive/`

### 项目目录管理规则
- **每个项目启动时，必须在 `workspace/` 下创建中文命名的项目目录**
- 项目信息（状态/进度/待办/代码位置等）**只存项目目录内**（如`项目概况.md`）
- MEMORY.md **只存路径指针**（如"COS热启动 → `workspace/COS热启动/`"）
- **绝不可以**在MEMORY.md中直接保存项目相关内容

### 写作规范
- ✅ 元层内容（保留）：称呼规范、运行模式、架构概览、已下沉经验的指针行、项目路径索引
- ❌ 不应存此处：具体操作步骤、10行以上的项目经验、项目状态/进度/代码信息 → 存到项目目录或用 `distill` 自动下沉
