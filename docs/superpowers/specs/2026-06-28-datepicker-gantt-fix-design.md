# DatePicker + Gantt 首次加载修复设计

## 问题 A：日期选择器上下按钮关闭日期栏

### 根因
日期 input 的 `onBlur` 直接调用 `commitEdit()`。原生浏览器日期选择器（shadow DOM）中点击上下箭头时，某些浏览器会触发 blur 事件，导致编辑器意外关闭。

### 修复
- 移除日期 input 的 `onBlur` 处理
- 移除 keydown handler 中对日期字段的 Enter 跳过
- 日期字段与其他字段统一使用：Enter 提交 / 点击外部区域提交 / 点击其他字段提交

### 改动
| 文件 | 行 | 改动 |
|------|-----|------|
| DetailPanel.tsx | ~365 | 删除 `onBlur={() => commitEdit()}` |
| DetailPanel.tsx | ~232-233 | 删除 `if (field === 'start_date' \|\| field === 'due_date') return` |

---

## 问题 B：甘特图首次加载不定位

### 根因
1. `dimension` 用 `useState('quarter')` + `useEffect` 异步初始化，首次渲染用错误维度计算滚动位置
2. `useEffect` 在浏览器绘制后执行，用户已看到错误位置

### 修复
1. 维度初始化改为 `useState` 惰性初始值，同步从 store 读取
2. 滚动定位改用 `useLayoutEffect`（DOM 提交后、绘制前执行）
3. 移除不再需要的 `scrollParamsRef`、`initialScrollDone`、双 rAF 重试逻辑

### 改动
| 文件 | 改动 |
|------|------|
| GanttView.tsx | `useState` 惰性初始值 + `useLayoutEffect` 替换滚动逻辑 + 清理废弃代码 |

---

## 交互流程

```
用户点击日期字段 → 编辑器打开 → 操作原生日期选择器
  → onChange 更新 editValue（编辑器保持打开，无 onBlur 干扰）
  → 按 Enter → commitEdit → 保存并关闭
  → 点击外部 → mousedown → commitEdit → 保存并关闭
  → 绿色 "已保存" 提示闪烁 1.5s
```