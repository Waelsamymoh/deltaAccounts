import { Sidebar } from '@/components/sidebar'
import { UndoProvider } from '@/lib/undo-context'
import { UndoButton } from '@/components/undo-button'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UndoProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <UndoButton />
    </UndoProvider>
  )
}
