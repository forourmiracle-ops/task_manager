import { useState, useCallback, useRef, useEffect } from 'react'
import type React from 'react'

export function useGanttScroll() {
  const dateScrollRef = useRef<HTMLDivElement | null>(null)
  const taskListRef = useRef<HTMLDivElement | null>(null)

  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [datePanelWidth, setDatePanelWidth] = useState(0)

  // ResizeObserver for date panel width
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

  // Chart structure is always rendered (no conditional loading/empty branches),
  // so the scroll container exists on mount and ref is immediately valid.
  // Single mount, stable lifecycle.
  useEffect(() => {
    const el = dateScrollRef.current
    if (!el) return
    let rafId: number | null = null
    const updateDOM = () => {
      if (taskListRef.current) taskListRef.current.scrollTop = el.scrollTop
    }
    const updateState = () => {
      setScrollLeft(el.scrollLeft)
      setScrollWidth(el.clientWidth)
    }
    const onScroll = () => {
      updateDOM()
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          updateState()
        })
      }
    }
    updateState()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', updateState)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', updateState)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  const handleTaskListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (dateScrollRef.current) {
      dateScrollRef.current.scrollTop = (e.target as HTMLElement).scrollTop
    }
  }, [])

  return {
    dateScrollRef,
    taskListRef,
    scrollLeft,
    scrollWidth,
    datePanelWidth,
    datePanelCallbackRef,
    handleTaskListScroll,
  }
}