# GanttView 重构设计规格

**日期**: 2026-07-01
**状态**: 已批准
**目标**: 将 1164 行甘特图组件拆分为可测试、可维护的 Hook + 组件架构，同时支持 1000+ 任务和 <1s 加载

---

## 1. 问题陈述

### 1.1 当前状态
- `GanttView.tsx` 1164 行，滚动监听、维度计算、视口裁剪、任务过滤、DOM 渲染全部耦合
- 11 轮修补后仍不稳定，每次改动引入新 bug
- 最近修复：`useEffect([isLoading])` 导致白屏，已回退到 `useEffect([])` 基线

### 1.2 性能目标
- 支持 1000+ 任务不卡顿
- 首屏加载 < 1 秒
- 滚动帧率 >= 50fps
- 内存占用 < 200MB（1000 任务场景）

---

## 2. 架构设计

### 2.1 拆分概览

```
GanttView (主组件, ~80行)
├── useGanttData        — 数据加载、树构建、父子关系 Map
├── useGanttViewport    — 视口裁剪、滚动位置、维度计算
├── useGanttLayout      — taskBar 位置预计算、today 定位
├── useGanttScroll      — 左右面板滚动同步 (rAF throttled)
│
├── GanttToolbar        — 维度切换、对齐按钮、导出
├── GanttTaskPanel      — 虚拟列表 + 拖拽 (左面板)
├── GanttTimeline       — 时间线容器 (右面板)
│   ├── GanttMonthHeaders — 月头
│   ├── GanttDayHeaders  — 日头 (仅渲染可见范围)
│   └── GanttTaskRows    — 任务条 + 周末遮罩 + 依赖线
```

### 2.2 Hook 接口

#### useGanttData
```
输入: 无（内部调用 useTasks()）
输出: { tasks, isLoading, allFlatTasks, parentMap, childCountMap, taskDateRange }
```
- `allFlatTasks`: buildTaskTree + flattenTasks + date filter（useMemo）
- `parentMap`: Map<id, parentId>，O(1) 深度查找
- `childCountMap`: { countMap, hasChildrenMap }，O(1) 子节点查询
- `taskDateRange`: { startDate, endDate, totalDays, monthHeaders, todayOffset }

#### useGanttViewport
```
输入: { scrollLeft, scrollWidth, datePanelWidth, DAY_WIDTH, totalDays, startDate, endDate, allFlatTasks, expandedIds, parentMap }
输出: { visibleDayRange, visibleTasks, viewportRange }
```
- `visibleDayRange`: 使用 `scrollWidth || datePanelWidth || 800` fallback，裁剪到 ~100 天
- `visibleTasks`: 基于 viewportRange 过滤，父节点展开检测
- 所有计算均为 useMemo，依赖稳定

#### useGanttLayout
```
输入: { visibleTasks, visibleDayRange, DAY_WIDTH, startDate, totalDays, todayOffset }
输出: { taskBarStyles, todayPosition, weekendHolidayIndices, dependencyLines }
```
- `taskBarStyles`: Map<taskId, { left, width }>，O(1) 查找
- `todayPosition`: todayOffset * DAY_WIDTH
- `weekendHolidayIndices`: Set<dayIndex>，零 new Date() 开销

#### useGanttScroll
```
输入: { dateScrollRef, taskListRef, isLoading }
输出: { scrollLeft, scrollWidth, handleTaskListScroll, datePanelCallbackRef, datePanelWidth }
```
- rAF-throttled 滚动同步
- useLayoutEffect 确保 DOM 就绪后绑定
- datePanelWidth 通过 ResizeObserver callback ref 获取

### 2.3 组件职责

| 组件 | 职责 | 输入 Props |
|------|------|------------|
| GanttToolbar | 维度/对齐按钮，导出 | dimension, viewStartMode, onDimensionChange, etc. |
| GanttTaskPanel | 虚拟列表渲染，拖拽排序 | visibleTasks, virtualizer, expandedIds, selectedTaskId |
| GanttTimeline | 时间线容器，滚动同步 | 所有 timeline 数据 |
| GanttMonthHeaders | 月头渲染 | monthHeaders, DAY_WIDTH |
| GanttDayHeaders | 日头渲染（仅可见范围） | visibleDayRange, DAY_WIDTH, todayOffset, weekendHolidayIndices |
| GanttTaskRows | 任务条 + 周末遮罩 + 依赖线 | virtualItems, taskBarStyles, visibleDayRange, weekendHolidayIndices |

---

## 3. 数据流

```
useTasks() → useGanttData → useGanttViewport → useGanttLayout
                                    ↓                    ↓
                              GanttTaskPanel      GanttTaskRows
                              GanttDayHeaders     GanttTimeline
```

- 单向数据流：Hook 计算 → 组件消费
- 无跨组件状态共享（除 Zustand store）
- 每个 Hook 的依赖都是稳定引用（useMemo/useCallback）

---

## 4. 加载优化

### 4.1 代码分割
- GanttView 已通过 React.lazy 分割
- 子组件不再额外 lazy（避免过多 Suspense 边界）

### 4.2 首屏渲染
- `isLoading` 期间：仅渲染加载动画（~10 行 JSX）
- 数据就绪后：一次性渲染完整 Gantt 图
- `visibleDayRange` fallback 确保首次渲染仅 ~100 天而非 3650 天
- `useLayoutEffect` 确保滚动监听在首次绘制前绑定

### 4.3 增量渲染
- 虚拟列表（@tanstack/react-virtual）仅渲染可见行
- `visibleDayRange` 仅渲染可见日
- 预计算 Map/Set 避免渲染期计算

---

## 5. 错误处理

- 每个 Hook 独立 try-catch，错误不传播
- `useGanttData` 中 `buildTaskTree` 异常时返回空数组
- `useGanttViewport` 中 `overlapsRange` 异常时跳过该任务
- 组件渲染异常时显示错误边界 fallback（新增 ErrorBoundary 包裹 GanttView）

---

## 6. 文件结构

```
src/components/gantt/
├── GanttView.tsx          (主组件, ~80行)
├── GanttToolbar.tsx       (工具栏)
├── GanttTaskPanel.tsx     (左面板虚拟列表)
├── GanttTimeline.tsx      (右面板时间线容器)
├── GanttDayHeaders.tsx    (日头)
├── GanttTaskRows.tsx      (任务条 + 周末遮罩)
├── DependencyLines.tsx    (依赖线 SVG，从 GanttView 提取)
├── GanttErrorBoundary.tsx (错误边界)
├── hooks/
│   ├── useGanttData.ts
│   ├── useGanttViewport.ts
│   ├── useGanttLayout.ts
│   └── useGanttScroll.ts
└── GanttDragLayer.tsx     (已有，拖拽覆盖层)
```

---

## 7. 验证标准

- [ ] TypeScript 编译零错误
- [ ] 20 任务场景：首屏加载 < 500ms
- [ ] 1000 任务场景：首屏加载 < 1s，滚动 >= 50fps
- [ ] 所有现有功能正常：维度切换、对齐、拖拽、展开/折叠、依赖线、导出
- [ ] 无控制台错误/警告
- [ ] 现有视图（看板、日历、设置等）不受影响