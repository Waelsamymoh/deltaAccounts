'use client'

import { createContext, useContext, useRef, useState, useCallback } from 'react'

export type UndoEntry = {
  label: string
  undo: () => Promise<void>
}

interface UndoCtx {
  push: (entry: UndoEntry) => void
  undo: () => Promise<void>
  canUndo: boolean
  count: number
  lastLabel: string
}

const Ctx = createContext<UndoCtx | null>(null)

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<UndoEntry[]>([])
  const [count, setCount] = useState(0)
  const [lastLabel, setLastLabel] = useState('')

  const push = useCallback((entry: UndoEntry) => {
    if (stackRef.current.length >= 10) stackRef.current.shift()
    stackRef.current.push(entry)
    setCount(stackRef.current.length)
    setLastLabel(entry.label)
  }, [])

  const undo = useCallback(async () => {
    if (stackRef.current.length === 0) return
    const entry = stackRef.current.pop()!
    setCount(stackRef.current.length)
    setLastLabel(stackRef.current.at(-1)?.label ?? '')
    await entry.undo()
    window.dispatchEvent(new CustomEvent('delta:refresh'))
  }, [])

  return (
    <Ctx.Provider value={{ push, undo, canUndo: count > 0, count, lastLabel }}>
      {children}
    </Ctx.Provider>
  )
}

export function useUndo() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUndo must be used inside UndoProvider')
  return ctx
}
