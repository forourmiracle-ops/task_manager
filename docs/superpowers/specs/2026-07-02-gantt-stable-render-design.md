# 甘特图稳定渲染 — 架构重构设计

**日期**: 2026-07-02
**状态**: 已批准
**问题**: 甘特图在多轮修复后仍无法正常渲染（任务列表和时线空白，无法滚动）

## 根因分析

条件渲染（isLoading/empty/full 三个分支）导致 DOM 被销毁和重建，`useGanttScroll` 的 ref 生命周期不可靠：

```
isLoading=true → 渲染 Spinner → useLayoutEffect 提前 return
isLoading=false → 渲染图表 → useLayoutEffect 重新运行
                                ↓
                    dateScrollRef.current 是否已就绪？依赖 React commit 时序
```

`useLayoutEffect([isLoading])` 在 isLoading 切换时不可靠，导致 scrollWidth 初始为 0，滚动容器未正确建立。

## 方案：消除条件渲染，图表结构始终存在

### 核心变更

1. **GanttView** 始终渲染完整图表结构（toolbar + 左右面板 + 日期头 + 滚动区）
2. 加载/空数据状态用 overlay 覆盖，不重建 DOM
3. **useGanttScroll** 回归 `useEffect([])`，ref 在 mount 时即有效
4. **scrollTarget** 默认值修正为 todayPosition（初始视图定位到今天）

### 架构对比

```
当前（有问题）:
  if isLoading → <Spinner />
  if empty → <EmptyState />
  return <FullChart />

新:
  <div>                           ← 容器始终存在
    <GanttToolbar />
    <div flex>
      <GanttTaskPanel />
      <div ref={datePanelCallbackRef}>
        <GanttMonthHeaders />
        <GanttDayHeaders />
        <div ref={dateScrollRef}>  ← ref 始终有效
          <GanttTaskRows />
        </div>
      </div>
    </div>
    {isLoading && <LoadingOverlay />}
    {!isLoading && isEmpty && <EmptyOverlay />}
  </div>
```

### Hook 变更

- **useGanttScroll**: 移除 `isLoading` 参数，`useEffect([])` 单次挂载
- **useGanttViewport**: 无变化
- **useGanttLayout**: `scrollTarget` default → `todayPosition`

### 性能保证

- 首屏渲染：图表骨架始终存在，无 DOM 重建
- 滚动延迟：`useEffect([])` 稳定挂载，rAF 节流，`passive: true`
- 视口裁剪：`visibleDayRange` 将 3650 天裁剪为 ~50 个 DOM 节点
- 虚拟列表：`@tanstack/react-virtual` 只渲染可见行 + 5 行 overscan
- 重渲染控制：`React.memo` + `useMemo` 预计算
- 内存：Map/Set 预计算，零 `new Date()` 在渲染循环中