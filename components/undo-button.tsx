'use client'

import { useEffect } from 'react'
import { useUndo } from '@/lib/undo-context'
import { Undo2 } from 'lucide-react'

export function UndoButton() {
  const { undo, canUndo, count, lastLabel } = useUndo()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  if (!canUndo) return null

  return (
    <button
      onClick={undo}
      title={`تراجع: ${lastLabel}\nCtrl+Z`}
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-full shadow-lg text-sm font-medium hover:bg-primary/90 transition-all active:scale-95"
    >
      <Undo2 className="w-4 h-4" />
      <span>تراجع</span>
      <span className="bg-white/20 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
        {count}
      </span>
    </button>
  )
}
