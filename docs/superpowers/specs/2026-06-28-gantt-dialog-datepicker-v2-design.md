# 甘特图 + 弹窗 + 日期选择器 v2 修复设计

## 问题 A：甘特图首次加载不定位 + 默认维度不生效

### 根因
`useLayoutEffect` 在 DOM 提交后同步执行 `scrollLeft` 赋值，但此时 scroll 容器内 `minWidth` 样式可能尚未被浏览器完成布局计算，导致 `scrollLeft` 赋值无效。`DAY_WIDTH` 依赖 ResizeObserver 异步更新，首次渲染用 fallback 值 40，后续 ResizeObserver 更新后虽然 `useLayoutEffect` 重跑，但容器仍可能不可滚动。

### 修复
1. 在 `useLayoutEffect` 内部用 `requestAnimationFrame` 延迟一帧设置 `scrollLeft`
2. 添加 `allFlatTasks.length` 到依赖数组，确保数据加载完成后重新定位

### 改动
| 文件 | 改动 |
|------|------|
| GanttView.tsx L276-290 | `requestAnimationFrame` 包裹 `scrollLeft` 赋值；添加 `allFlatTasks.length` 依赖 |

---

## 问题 B：新建任务弹窗透明

### 根因
Tailwind CSS v4 `@import "tailwindcss"` 语法下，`@layer base` 中定义的 CSS 变量 `--card` 不会自动生成 `bg-card` 等 utility class。导致弹窗无背景色。

### 修复
`bg-card` → `bg-background`。三个主题下 `--card` 和 `--background` 值相同或视觉等效，且 `bg-background` 已验证可用。

### 改动
| 文件 | 改动 |
|------|------|
| CreateTaskDialog.tsx L116 | `bg-card` → `bg-background` |

---

## 问题 C：日期调整仅识别 Enter

### 根因
日期 input 的 `onChange` 仅更新 `editValue`，不提交。原生日期选择器选择日期后，用户还需额外操作。

### 修复
1. 日期 input 的 `onChange` 中直接调用 `commitEdit(e.target.value)`
2. 保留 `mousedown` 外部点击提交（composedPath 穿透 shadow DOM）
3. 保留 Enter 键提交

### 改动
| 文件 | 改动 |
|------|------|
| DetailPanel.tsx L374 | `onChange` 从 `setEditValue` 改为 `commitEdit(e.target.value)` |

---

## 交互流程

```
日期字段：
  选择器选择日期 → onChange → commitEdit(新值) → 保存并关闭
  点击外部区域 → mousedown → commitEdit(当前值) → 保存并关闭
  Enter 键 → commitEdit(当前值) → 保存并关闭

甘特图：
  首次加载 → useLayoutEffect → rAF → scrollLeft = 当天位置
  切换默认维度 → useEffect → setDimension → useLayoutEffect 重跑 → rAF → 新位置
  数据加载完成 → allFlatTasks.length 变化 → useLayoutEffect 重跑

新建任务弹窗：
  打开 → bg-background 不透明背景
```