'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { RefreshCw, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface ReportEntry {
  id: string
  date: string
  amount: number
  type: string
  source: string
  detail: string
  statement: string
}

const SOURCE_LABELS: Record<string, string> = {
  manager_general:  'المدير — عام',
  manager_monthly:  'المدير — شهري',
  manager_daily:    'المدير — يومي',
  investor:         'المستثمرون',
  debt:             'علينا',
  creditor:         'لينا',
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  in:         { label: 'داخل',        color: 'text-blue-600 bg-blue-50' },
  out:        { label: 'خارج',        color: 'text-red-500 bg-red-50' },
  assets_in:  { label: 'أصول داخل',  color: 'text-blue-600 bg-blue-50' },
  assets_out: { label: 'أصول خارج',  color: 'text-red-500 bg-red-50' },
  profit:     { label: 'أرباح',       color: 'text-green-600 bg-green-50' },
  daily:      { label: 'ربح يومي',   color: 'text-purple-600 bg-purple-50' },
  debt:       { label: 'علينا',       color: 'text-orange-600 bg-orange-50' },
  creditor:   { label: 'لينا',        color: 'text-teal-600 bg-teal-50' },
}

const ALL_SOURCES = ['all', ...Object.keys(SOURCE_LABELS)]

export function ReportsClient() {
  const [entries, setEntries] = useState<ReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const [clearDialog, setClearDialog] = useState(false)
  const [clearMonth, setClearMonth] = useState('')
  const [clearing, setClearing] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const all: ReportEntry[] = []

    // Manager general transactions
    const { data: mgrTx } = await supabase
      .from('manager_transactions')
      .select('*')
      .order('date', { ascending: false })
    ;(mgrTx ?? []).forEach((r: any) => {
      all.push({ id: r.id, date: r.date, amount: r.amount, type: r.type, source: 'manager_general', detail: '—', statement: r.statement ?? '—' })
    })

    // Manager monthly transactions
    const { data: months } = await supabase.from('manager_months').select('id, year_month')
    const monthMap: Record<string, string> = {}
    ;(months ?? []).forEach((m: any) => { monthMap[m.id] = m.year_month })

    const { data: mgrMonthTx } = await supabase
      .from('manager_month_transactions')
      .select('*')
      .order('date', { ascending: false })
    ;(mgrMonthTx ?? []).forEach((r: any) => {
      const ym = monthMap[r.month_id] ?? r.month_id
      all.push({ id: r.id, date: r.date, amount: r.amount, type: r.type, source: 'manager_monthly', detail: formatYM(ym), statement: r.statement ?? '—' })
    })

    // Manager daily
    const { data: daily } = await supabase
      .from('manager_month_daily')
      .select('*')
      .order('date', { ascending: false })
    ;(daily ?? []).forEach((r: any) => {
      const ym = monthMap[r.month_id] ?? r.month_id
      all.push({ id: r.id, date: r.date, amount: r.daily_profit, type: 'daily', source: 'manager_daily', detail: formatYM(ym), statement: r.notes ?? '—' })
    })

    // Investor entries
    const { data: invProfiles } = await supabase.from('investor_profiles').select('id, name')
    const invMap: Record<string, string> = {}
    ;(invProfiles ?? []).forEach((p: any) => { invMap[p.id] = p.name })

    const { data: invEntries } = await supabase
      .from('investor_entries')
      .select('*')
      .order('date', { ascending: false })
    ;(invEntries ?? []).forEach((r: any) => {
      all.push({ id: r.id, date: r.date, amount: r.amount, type: r.type, source: 'investor', detail: invMap[r.investor_id] ?? '—', statement: r.statement ?? '—' })
    })

    // Debts
    const { data: debts } = await supabase.from('debts').select('*').order('date', { ascending: false })
    ;(debts ?? []).forEach((r: any) => {
      all.push({ id: r.id, date: r.date, amount: r.amount, type: 'debt', source: 'debt', detail: r.debtor_name, statement: '—' })
    })

    // Creditors
    const { data: creditors } = await supabase.from('creditors').select('*').order('date', { ascending: false })
    ;(creditors ?? []).forEach((r: any) => {
      all.push({ id: r.id, date: r.date, amount: r.amount, type: 'creditor', source: 'creditor', detail: r.creditor_name, statement: '—' })
    })

    // Sort all by date desc
    all.sort((a, b) => b.date.localeCompare(a.date))
    setEntries(all)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function clearByMonth() {
    if (!clearMonth) return
    // last day of selected month
    const [y, m] = clearMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const cutoff = `${clearMonth}-${String(lastDay).padStart(2, '0')}`

    setClearing(true)
    await Promise.all([
      supabase.from('manager_transactions').delete().lte('date', cutoff),
      supabase.from('manager_month_transactions').delete().lte('date', cutoff),
      supabase.from('manager_month_daily').delete().lte('date', cutoff),
      supabase.from('investor_entries').delete().lte('date', cutoff),
      supabase.from('debts').delete().lte('date', cutoff),
      supabase.from('creditors').delete().lte('date', cutoff),
    ])
    setClearing(false)
    setClearDialog(false)
    setClearMonth('')
    await loadAll()
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
      if (dateFrom && e.date < dateFrom) return false
      if (dateTo && e.date > dateTo) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.detail.toLowerCase().includes(q) && !e.statement.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [entries, sourceFilter, dateFrom, dateTo, search])

  const totalIn = filtered.filter(e => ['in', 'assets_in'].includes(e.type)).reduce((s, e) => s + e.amount, 0)
  const totalOut = filtered.filter(e => ['out', 'assets_out'].includes(e.type)).reduce((s, e) => s + e.amount, 0)
  const totalProfit = filtered.filter(e => ['profit', 'daily'].includes(e.type)).reduce((s, e) => s + e.amount, 0)

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => setClearDialog(true)}>
            <Trash2 className="w-4 h-4 ml-1" />
            مسح بالشهر
          </Button>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">التقارير</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} عملية</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-right">
          <p className="text-xs text-blue-500">إجمالي داخل</p>
          <p className="text-base font-bold text-blue-600">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-right">
          <p className="text-xs text-red-500">إجمالي خارج</p>
          <p className="text-base font-bold text-red-500">{formatCurrency(totalOut)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-right">
          <p className="text-xs text-green-500">إجمالي أرباح</p>
          <p className="text-base font-bold text-green-600">{formatCurrency(totalProfit)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-3 space-y-2">
        {/* Source filter */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                sourceFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {s === 'all' ? 'الكل' : SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Date + search */}
        <div className="flex gap-2 flex-wrap">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-7 text-xs w-36" placeholder="من تاريخ" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-7 text-xs w-36" placeholder="إلى تاريخ" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs flex-1 min-w-[150px]" placeholder="بحث في البيان أو التفاصيل..." />
          {(dateFrom || dateTo || search) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setSearch('') }} className="text-xs text-muted-foreground hover:text-red-500 px-2">
              مسح
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right py-2 text-xs">التاريخ</TableHead>
              <TableHead className="text-right py-2 text-xs">النوع</TableHead>
              <TableHead className="text-right py-2 text-xs">المصدر</TableHead>
              <TableHead className="text-right py-2 text-xs">التفاصيل</TableHead>
              <TableHead className="text-right py-2 text-xs">البيان</TableHead>
              <TableHead className="text-right py-2 text-xs">المبلغ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">لا توجد نتائج</TableCell></TableRow>
            )}
            {filtered.map((e) => {
              const t = TYPE_LABELS[e.type] ?? { label: e.type, color: 'text-muted-foreground bg-muted' }
              return (
                <TableRow key={`${e.source}-${e.id}`} className="hover:bg-muted/10">
                  <TableCell className="py-1.5 text-xs text-muted-foreground">{e.date}</TableCell>
                  <TableCell className="py-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs font-medium">{SOURCE_LABELS[e.source] ?? e.source}</TableCell>
                  <TableCell className="py-1.5 text-xs">{e.detail}</TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground max-w-[200px] truncate">{e.statement}</TableCell>
                  <TableCell className={`py-1.5 text-sm font-semibold ${
                    ['in','assets_in'].includes(e.type) ? 'text-blue-600' :
                    ['out','assets_out'].includes(e.type) ? 'text-red-500' :
                    ['profit','daily'].includes(e.type) ? 'text-green-600' :
                    e.type === 'debt' ? 'text-orange-600' : 'text-teal-600'
                  }`}>
                    {formatCurrency(e.amount)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {/* Clear by month dialog */}
      <Dialog open={clearDialog} onOpenChange={setClearDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-red-600">مسح التقارير حتى نهاية شهر</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); clearByMonth() }} className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              سيتم حذف جميع العمليات من كل الجداول حتى نهاية الشهر المختار. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">اختر الشهر</label>
              <Input
                type="month"
                value={clearMonth}
                onChange={(e) => setClearMonth(e.target.value)}
                autoFocus
              />
            </div>
            {clearMonth && (
              <p className="text-xs text-red-500">
                سيتم حذف كل العمليات حتى {formatYM(clearMonth)}
              </p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setClearDialog(false)}>إلغاء</Button>
              <Button
                type="submit"
                disabled={!clearMonth || clearing}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {clearing ? 'جاري المسح...' : 'مسح'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
function formatYM(ym: string) {
  const [year, month] = ym.split('-')
  return `${ARABIC_MONTHS[parseInt(month) - 1]} ${year}`
}
