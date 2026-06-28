# 甘特图无限滚动 + 默认维度 + 优先级标记 + 父子区分强化

## 概述

五个核心改动：
1. 甘特图固定 365 天范围，实现无限横向滚动
2. 默认维度设置（store 持久化 + 导航栏面板 + 甘特图工具栏）
3. 优先级颜色标记
4. 父子任务透明度+宽度区分
5. 日期显示规则（今天在第 3 列 / 今天所在周为第一周）

---

## 一、无限滚动 + 宽度立即生效

### 1.1 问题

图表范围仅基于任务日期，任务结束后图表截断。`totalWidth = totalDays * DAY_WIDTH`，DAY_WIDTH 小时 totalWidth 可能小于视口，无滚动。

### 1.2 方案

- 图表范围固定 **365 天**：`startDate = today - 180`, `endDate = today + 184`
- `totalDays = 365`，`totalWidth = 365 * DAY_WIDTH`，始终可滚动
- 任务超出 365 天范围仍正常渲染（`left` 可为负或超出）
- 切换维度时 DAY_WIDTH 立即重算，totalWidth 同步变化

### 1.3 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 二、默认维度持久化

### 2.1 方案

- Store 新增 `defaultDimension` 字段，类型 `'auto' | Dimension`
- 持久化到 localStorage（`taskflow-default-dimension`）
- 顶部导航栏设置面板：增加"默认维度"下拉选择器
- 甘特图工具栏：维度按钮旁齿轮图标，点击弹出设置面板
- "自动"模式：根据所有任务的平均周期自动选择

### 2.2 自动选择逻辑

```
平均周期 < 7天 → 一周
平均周期 < 30天 → 当月
平均周期 < 90天 → 季度
平均周期 < 180天 → 半年
平均周期 ≥ 180天 → 全年
```

### 2.3 涉及文件

- `src/store/index.ts`
- `src/App.tsx`
- `src/components/gantt/GanttView.tsx`

---

## 三、优先级标记

### 3.1 方案

任务列表（左侧面板）：
- 优先级色点替换状态色点（状态色点移到进度条百分比的左侧）
- 色值：high→红色 `#ef4444`，medium→黄色 `#f59e0b`，low→灰色 `#9ca3af`

进度条（右侧面板）：
- 进度条左侧 3px 优先级色块标记

### 3.2 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 四、父子任务区分（透明度+宽度）

### 4.1 方案

进度条：
- 父任务：`opacity: 1`，`top: 4, bottom: 4`（完整高度）
- 子任务：`opacity: 0.75`，`top: 8, bottom: 8`（缩窄高度，视觉上更矮更淡）

任务列表：
- 子任务行左侧竖线连接线（`border-l-2` 样式）

### 4.2 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 五、子任务日期约束

### 5.1 方案

`handleSubmit` 中增加校验：
- 子任务 `start_date` < 父任务 `start_date` 或 > 父任务 `due_date` → 阻断提交
- 子任务 `due_date` > 父任务 `due_date` 或 < 父任务 `start_date` → 阻断提交

### 5.2 涉及文件

- `src/components/tasks/CreateTaskDialog.tsx`

---

## 六、日期显示规则

### 6.1 方案

| 维度 | 初始滚动位置 |
|------|-------------|
| 一周 / 当月 | `(todayOffset - 2) * DAY_WIDTH`（今天在第 3 列） |
| 季度 / 半年 / 全年 | `(todayOffset - today.getDay()) * DAY_WIDTH`（今天所在周为第一周） |

### 6.2 涉及文件

- `src/components/gantt/GanttView.tsx`