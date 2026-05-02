'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookUser, Building2, Calculator, FileText, UserCog, Users, HandCoins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const navItems = [
  { href: '/balance', label: 'حساب الرصيد', icon: Calculator },
  { href: '/bank-accounts', label: 'الحسابات البنكية', icon: Building2 },
  { href: '/investors', label: 'المستثمرون', icon: Users },
  { href: '/manager', label: 'صفحة المدير', icon: UserCog },
  { href: '/others-funds', label: 'حساب اموال الغير', icon: HandCoins },
  { href: '/reports', label: 'التقارير', icon: FileText },
  { href: '/clients', label: 'حسابات العملاء', icon: BookUser },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Delta Accounts</p>
            <p className="text-xs text-sidebar-foreground/60">🇪🇬</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <ThemeToggle />
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold">
            م
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">المدير</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">@deltaaccounts.eg</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
