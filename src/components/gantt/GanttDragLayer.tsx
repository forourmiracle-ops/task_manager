import { useRef, useState, useCallback } from 'react'
import { useUpdateTask } from '@/hooks/useTasks'
import type { Task } from '@/types'

interface GanttDragLayerProps {
  tasks: Task[]
  children: (props: {
    onDragStart: (e: React.DragEvent, taskId: string) => void
    onDragOver: (e: React.DragEvent, index: number) => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent, index: number) => void
    onDragEnd: () => void
    draggingId: string | null
    dropIndex: number | null
    conflictInfo: string | null
  }) => React.ReactNode
}

export function GanttDragLayer({ tasks, children }: GanttDragLayerProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [conflictInfo, setConflictInfo] = useState<string | null>(null)
  const dragStartRef = useRef(0)
  const updateTask = useUpdateTask()

  const checkConstraints = useCallback(
    (sourceId: string, targetIndex: number): string | null => {
      const sourceTask = tasks.find((t) => t.id === sourceId)
      if (!sourceTask) return null

      const targetTask = tasks[targetIndex]
      if (!targetTask || sourceId === targetTask.id) return null

      // Check if source is a parent of target
      const isDescendant = (parentId: string, childId: string): boolean => {
        const children = tasks.filter((t) => t.parent_id === parentId)
        return children.some((c) => c.id === childId || isDescendant(c.id, childId))
      }
      if (isDescendant(sourceId, targetTask.id)) {
        return '不能将父任务拖到子任务位置'
      }

      // Check hierarchy change: if target has a different parent
      if (sourceTask.parent_id !== targetTask.parent_id) {
        const newParent = tasks.find((t) => t.id === targetTask.parent_id)
        if (newParent) {
          if (sourceTask.start_date && newParent.start_date && sourceTask.start_date < newParent.start_date) {
            return `任务开始日期早于新父任务开始日期（${newParent.start_date}）`
          }
          if (sourceTask.due_date && newParent.due_date && sourceTask.due_date > newParent.due_date) {
            return `任务截止日期晚于新父任务截止日期（${newParent.due_date}）`
          }
        }
        return '将更改任务层级关系'
      }

      return null
    },
    [tasks],
  )

  const reorder = useCallback(
    (sourceId: string, targetIndex: number) => {
      const sourceIdx = tasks.findIndex((t) => t.id === sourceId)
      if (sourceIdx === -1 || sourceIdx === targetIndex) return

      const targetTask = tasks[targetIndex]
      // Simple reorder: update sort_order of the source task to be between neighbors
      const prevTask = targetIndex > 0 ? tasks[targetIndex - 1] : null
      const nextTask = targetIndex < tasks.length - 1 ? tasks[targetIndex + 1] : null

      let newSortOrder: number
      if (sourceIdx < targetIndex) {
        // Moving down: insert after target
        if (nextTask) {
          newSortOrder = (targetTask.sort_order + nextTask.sort_order) / 2
        } else {
          newSortOrder = targetTask.sort_order + 1
        }
      } else {
        // Moving up: insert before target
        if (prevTask) {
          newSortOrder = (prevTask.sort_order + targetTask.sort_order) / 2
        } else {
          newSortOrder = targetTask.sort_order - 1
        }
      }

      // If hierarchy changes, also update parent_id
      const sourceTask = tasks[sourceIdx]
      const hierarchyChanged = sourceTask.parent_id !== targetTask.parent_id

      updateTask.mutate({
        id: sourceId,
        sort_order: newSortOrder,
        ...(hierarchyChanged ? { parent_id: targetTask.parent_id } : {}),
      })
    },
    [tasks, updateTask],
  )

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    dragStartRef.current = Date.now()
    setDraggingId(taskId)
    setConflictInfo(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
    // Make drag image transparent
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
    e.dataTransfer.setDragImage(img, 0, 0)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)

    const info = checkConstraints(draggingId || '', index)
    setConflictInfo(info)
  }

  const handleDragLeave = () => {
    setDropIndex(null)
    setConflictInfo(null)
  }

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain')
    const duration = Date.now() - dragStartRef.current

    const conflict = checkConstraints(sourceId, index)
    if (conflict && duration < 3000) {
      // Too short, bounce back
      setDraggingId(null)
      setDropIndex(null)
      setConflictInfo(null)
      return
    }

    // Execute reorder (conflict was confirmed by 3s hold)
    reorder(sourceId, index)
    setDraggingId(null)
    setDropIndex(null)
    setConflictInfo(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropIndex(null)
    setConflictInfo(null)
  }

  return children({
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    draggingId,
    dropIndex,
    conflictInfo,
  })
}