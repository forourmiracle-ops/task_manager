# 甘特图维度重构 & 详情面板保存修复

## 概述

三个关联改动：
1. **甘特图维度系统重构**：工具栏术语从"粒度"改为"维度"，新增"一周"选项，DAY_WIDTH 适配设备宽度，无横向滚动即可看到对应维度的完整排期
2. **详情面板保存 bug 修复**：排查并修复 `commitEdit` → `buildPayload` → `updateTask.mutate` 链路中保存失效的问题
3. **日期数修正**：各维度对应正确的日期数

---

## 一、甘特图维度系统重构

### 1.1 术语变更

| 变更前 | 变更后 |
|--------|--------|
| 粒度 | 维度 |
| 当月 / 季度 / 半年 / 全年 | 一周 / 当月 / 季度 / 半年 / 全年 |

### 1.2 维度与天数映射

| 维度 | 天数 | 说明 |
|------|------|------|
| 一周 | 7 | 新增 |
| 当月 | 30 | 约一个月 |
| 季度 | 90 | 约三个月 |
| 半年 | 180 | 约六个月 |
| 全年 | 365 | 约一年 |

### 1.3 DAY_WIDTH 动态计算

**核心公式：**

```
DAY_WIDTH = Math.max(MIN_DAY_WIDTH, Math.round(availableWidth / dimensionDays))
```

- `availableWidth`：日期面板可用宽度 = 右侧面板总宽度（不含左侧任务列）
- `dimensionDays`：当前维度的天数
- `MIN_DAY_WIDTH`：3px（全年视图下保证可渲染）

**关键点：**
- 使用 `ResizeObserver` 监听日期面板容器宽度变化，实时重算 `DAY_WIDTH`
- 窗口 resize 时自动适配
- 左侧任务列宽度固定（`LABEL_WIDTH`），不参与 DAY_WIDTH 计算

### 1.4 滚动行为

- 图表覆盖所有任务的日期范围（`totalDays` 不变）
- 初始滚动位置：居中于今天，向前偏移 `dimensionDays / 2` 天，确保维度范围完整可见
- 用户可自由滚动到任意日期，无限制
- 切换维度时重新计算 DAY_WIDTH 并调整初始滚动位置

### 1.5 各维度预期效果

以 1200px 日期面板宽度为例：

| 维度 | DAY_WIDTH | 视口内可见天数 | 效果 |
|------|-----------|---------------|------|
| 一周 | ~171px | 7 | 每日列宽充足，任务条清晰 |
| 当月 | ~40px | 30 | 列宽舒适，可看清每日任务 |
| 季度 | ~13px | 90 | 列宽较窄，可看清任务分布 |
| 半年 | ~7px | 180 | 列宽很窄，适合宏观概览 |
| 全年 | ~3px | 365 | 列宽极小，整体分布全貌 |

### 1.6 实现要点

涉及文件：`src/components/gantt/GanttView.tsx`

改动清单：
1. 工具栏文字：`粒度` → `维度`，选项列表改为 `一周/当月/季度/半年/全年`
2. 新增 `datePanelRef` 和 `ResizeObserver` 获取日期面板宽度
3. `DAY_WIDTH` 改为基于 `availableWidth / dimensionDays` 计算
4. `viewMonths` 状态改为 `dimension` 状态（类型：`'week' | 'month' | 'quarter' | 'halfyear' | 'year'`）
5. 维度-天数映射常量 `DIMENSION_DAYS`
6. 初始滚动位置改为 `todayOffset - dimensionDays / 2`
7. 移除 `scale` 对 `DAY_WIDTH` 的影响（字号缩放仍影响 `ROW_HEIGHT`、`LABEL_WIDTH`、`HEADER_HEIGHT`）

---

## 二、详情面板保存修复

### 2.1 问题分析

代码审查发现 `commitEdit` → `buildPayload` → `updateTask.mutate` 链路逻辑正确，但存在以下潜在问题：

1. **`buildPayload` 可能返回 null**：当值未变化时（如用户点击字段后未修改直接失焦），`changed` 为 false，`buildPayload` 返回 null，看起来像"保存没生效"
2. **React 状态批量更新时序**：`commitEdit` 中 `setEditingField(null)` 和 `updateTask.mutate` 在同一事件循环中，可能导致 ref 在突变回调前被清空

### 2.2 修复方案

1. 在 `commitEdit` 中，先保存 ref 值到局部变量，再清空状态
2. 确保 `buildPayload` 在 `setEditingField(null)` 之前调用
3. 添加 `console.log` 调试日志，确认 `buildPayload` 的返回值
4. 如果 `buildPayload` 返回 null（值未变化），添加可选提示

### 2.3 涉及文件

- `src/components/tasks/DetailPanel.tsx`

---

## 三、附加细节

### 3.1 字号缩放行为

- `ROW_HEIGHT`、`LABEL_WIDTH`、`HEADER_HEIGHT` 仍受 `scale`（字号）影响
- `DAY_WIDTH` 不再受 `scale` 影响，完全由设备宽度和维度决定
- 工具栏按钮尺寸和间距保持现有字号缩放逻辑不变

### 3.2 最小列宽保护

- `MIN_DAY_WIDTH = 3`，防止全年视图下 DAY_WIDTH 为 0
- 当 `availableWidth / dimensionDays < MIN_DAY_WIDTH` 时（极窄窗口），使用 `MIN_DAY_WIDTH`，此时视图可能需要轻微滚动

### 3.3 回到今天按钮

- 行为不变：滚动到 `todayOffset - dimensionDays / 2` 位置
- 按钮文字保持"回到今天"