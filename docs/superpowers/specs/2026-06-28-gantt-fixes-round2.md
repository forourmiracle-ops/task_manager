# 甘特图修复 & 体验优化（第二轮）

## 概述

六个关联改动，涉及甘特图维度显示、弹窗透明度、子任务约束、父子区分、详情面板关闭。

---

## 一、甘特图维度显示修复（核心）

### 1.1 问题

- 维度切换后始终只显示 9 个日期（DAY_WIDTH fallback 40px × 9 = 360px）
- 月份头/日期头不随滚动移动（JS 同步 scrollLeft 失效）
- 设置任务后宽度不变，需切换界面才生效

### 1.2 根因

当前右侧面板分为三层独立容器：
- 月份头：`overflow:hidden`，通过 `monthHeaderRef` 同步 scrollLeft
- 日期头：`overflow:hidden`，通过 `dayHeaderRef` 同步 scrollLeft
- 进度条：`overflow:auto`，`dateScrollRef` 是滚动源

ResizeObserver 监听 `datePanelRef`（外层容器），初始回调时 `datePanelWidth` 为 0，fallback 到 40px。

### 1.3 方案：统一滚动容器

将右侧面板三层合并为一个滚动容器：

```
右侧面板 (datePanelRef, ResizeObserver)
└── 统一滚动容器 (overflow: auto)
    ├── 月份头 (position: sticky; top: 0)
    ├── 日期头 (position: sticky; top: 28px)
    └── 进度条区域
```

- 三排共享同一个 `scrollLeft`，无需 JS 同步
- 移除 `monthHeaderRef`、`dayHeaderRef` 的 scroll 同步代码
- 保留 `dateScrollRef` 作为统一滚动容器的 ref
- 月份头 `sticky top: 0`，日期头 `sticky top: MONTH_HEADER_HEIGHT`
- `ResizeObserver` 仍监听 `datePanelRef`

### 1.4 DAY_WIDTH 计算

```
DAY_WIDTH = Math.max(3, Math.round(datePanelWidth / dimensionDays))
```

- 初始 fallback 从 40px 改为测量实际宽度
- 维度切换时自动重算

### 1.5 日期范围

- 图表范围：任务最早日期 - 3 天 → 最晚日期 + 3 天
- 初始滚动：`todayOffset * DAY_WIDTH - datePanelWidth / 2`（今天居中）
- 用户可自由滚动，无限制

### 1.6 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 二、新建任务弹窗透明度

### 2.1 问题

弹窗再次出现透明度过高的问题。

### 2.2 方案

- 弹窗内容背景从 `bg-background` 改为 `bg-card`（确保不透明）

### 2.3 涉及文件

- `src/components/tasks/CreateTaskDialog.tsx`

---

## 三、子任务日期约束

### 3.1 方案

创建子任务时：
- 如果父任务有 `start_date`，子任务开始日期 `min` 属性设为父任务开始日期
- 如果父任务有 `due_date`，子任务截止日期 `max` 属性设为父任务截止日期
- 提交时校验：子任务日期超出父任务范围时提示错误

### 3.2 涉及文件

- `src/components/tasks/CreateTaskDialog.tsx`

---

## 四、甘特图父子任务区分

### 4.1 方案

**任务列表区（左侧面板）：**
- 父任务（有子任务）：标题 `font-bold`，显示子任务数量徽章
- 子任务：标题正常字重，左侧缩进

**进度条区域（右侧面板）：**
- 父任务条：左侧加 3px 竖条标记（颜色同状态色），条主体稍窄
- 子任务条：左侧缩进 8px，条主体正常

### 4.2 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 五、详情面板快捷关闭

### 5.1 方案

- 在 `DetailPanel` 内添加全局 `keydown` 监听：`Escape` 关闭面板
- 在 `GanttView` 空白区域（非任务条区域）点击时，调用 `setSelectedTaskId(null)` 关闭面板

### 5.2 涉及文件

- `src/components/tasks/DetailPanel.tsx`
- `src/components/gantt/GanttView.tsx`