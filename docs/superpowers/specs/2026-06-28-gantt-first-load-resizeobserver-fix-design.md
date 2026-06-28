# GanttView 首次加载 ResizeObserver 失效修复

## 问题

首次打开应用时，甘特图日期列宽度异常（偏窄），需要切换到其他视图再切回来才能恢复正常显示。

## 根因

`GanttView` 在 `isLoading === true` 时提前返回 loading spinner，导致 `datePanelRef` 未绑定到 DOM 元素。`ResizeObserver` 的 `useEffect`（空依赖 `[]`）在此时执行，因 `ref.current === null` 直接退出，**永远不会再执行**。

当数据加载完成后甘特图真正渲染时，`useEffect` 不会重新触发，`datePanelWidth` 永久保持 `0`。`DAY_WIDTH` 始终使用 fallback 值 `480 / dimensionDays`（如季度维度仅 5.33px，实际应为 ~13px），导致日期列宽度异常。

切换视图后恢复的原因：重新挂载时数据已缓存，`isLoading` 立即为 `false`，甘特图首次渲染时 ref 就存在，ResizeObserver 正常初始化。

## 方案

**方案 A（选定）：使用 callback ref 绑定 ResizeObserver**

将 `ref={datePanelRef}` 改为 callback ref 模式，在 DOM 元素挂载时立即初始化 ResizeObserver，卸载时清理。不依赖 `useEffect` 的执行时机，与 loading 状态完全解耦。

### 变更文件

`src/components/gantt/GanttView.tsx`

### 变更内容

1. **新增 `observerRef`**：持有 `ResizeObserver` 实例引用，用于 cleanup
2. **新增 `datePanelCallbackRef`**：`useCallback` 包裹的 callback ref，在元素挂载时创建 Observer、卸载时销毁
3. **删除现有 `useEffect`（约第 159-169 行）**：移除 ResizeObserver 的 useEffect 设置
4. **日期面板 div 同时使用两个 ref**：callback ref 负责 Observer 生命周期，`datePanelRef` 继续用于 scroll 同步

### 关键代码

```tsx
const observerRef = useRef<ResizeObserver | null>(null)

const datePanelCallbackRef = useCallback((el: HTMLDivElement | null) => {
  observerRef.current?.disconnect()
  observerRef.current = null
  if (!el) return
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      setDatePanelWidth(entry.contentRect.width)
    }
  })
  ro.observe(el)
  observerRef.current = ro
}, [])
```

日期面板 div ref 改为：
```tsx
<div
  className="flex-1 flex flex-col overflow-hidden"
  ref={(el) => {
    (datePanelRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    datePanelCallbackRef(el)
  }}
>
```

### 备选方案

- **方案 B**：给 useEffect 添加 `isLoading` 依赖。改动最小，但依赖 `isLoading` 不够语义化，且 `isLoading` 可能在后续 refetch 时再次触发。
- **方案 C**：消除 loading 早期返回，始终渲染甘特图 DOM。改动大，loading 状态下渲染不必要的大范围日期浪费性能。

## 验证

- 首次打开应用，甘特图日期列宽度应正确匹配当前面板宽度
- 切换维度，日期列宽度应实时响应
- 切换视图后返回，甘特图应正常显示
- 刷新页面，甘特图应直接显示正确（无需先切视图）