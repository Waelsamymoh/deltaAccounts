'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ManagerTransaction, ManagerMonth, ManagerMonthReport, ManagerMonthTransaction } from '@/lib/database.types'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Wallet,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  FileText,
  ArrowDownToLine,
} from 'lucide-react'
import { useUndo } from '@/lib/undo-context'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function formatYM(ym: string) {
  const [year, month] = ym.split('-')
  return `${ARABIC_MONTHS[parseInt(month) - 1]} ${year}`
}

function thisYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// ────── General TxTable (used in general section) ──────
interface TxTableProps {
  rows: ManagerTransaction[]
  type: 'in' | 'out'
  onAdd: () => void
  onDelete: (id: string) => void
}

function TxTable({ rows, type, onAdd, onDelete }: TxTableProps) {
  const filtered = rows.filter((r) => r.type === type)
  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const isIn = type === 'in'
  const colorBtn = isIn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
  const colorTxt = isIn ? 'text-blue-600' : 'text-red-500'

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between">
        <button
          onClick={onAdd}
          className={`flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${colorBtn}`}
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة
        </button>
        <div className="text-right">
          <p className="text-sm font-semibold">{isIn ? 'داخل' : 'خارج'}</p>
          <p className={`text-xs font-medium ${colorTxt}`}>{formatCurrency(total)}</p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-right py-1 text-xs">البيان</TableHead>
            <TableHead className="text-right py-1 text-xs">المبلغ</TableHead>
            <TableHead className="text-right py-1 text-xs">التاريخ</TableHead>
            <TableHead className="w-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-3">
                لا يوجد بيانات
              </TableCell>
            </TableRow>
          )}
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="py-1 text-xs">{row.statement || '—'}</TableCell>
              <TableCell className={`py-1 text-xs font-medium ${colorTxt}`}>
                {formatCurrency(row.amount)}
              </TableCell>
              <TableCell className="py-1 text-xs text-muted-foreground">{row.date}</TableCell>
              <TableCell className="py-1">
                <button onClick={() => onDelete(row.id)}>
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                </button>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length > 0 && (
            <TableRow className="bg-muted/20 font-semibold text-xs">
              <TableCell className="py-1">الإجمالي</TableCell>
              <TableCell className={`py-1 ${colorTxt}`}>{formatCurrency(total)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ────── Combined داخل/خارج table for monthly sections ──────
interface CombinedTxTableProps {
  rows: ManagerMonthTransaction[]
  onAddIn: () => void
  onAddOut: () => void
  onDelete: (id: string) => void
  onImport: () => void
}

function CombinedTxTable({ rows, onAddIn, onAddOut, onDelete, onImport }: CombinedTxTableProps) {
  const totalIn = rows.filter((r) => r.type === 'in').reduce((s, r) => s + r.amount, 0)
  const totalOut = rows.filter((r) => r.type === 'out').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onAddIn}
            className="flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            داخل
          </button>
          <button
            onClick={onAddOut}
            className="flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors bg-red-600 hover:bg-red-700"
          >
            <Plus className="w-3.5 h-3.5" />
            خارج
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border border-blue-400 text-blue-600 hover:bg-blue-50"
            title="استورد كل بيانات الجدول العام إلى هذا الشهر"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            استورد من العام
          </button>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div className="text-xs space-y-0.5">
            <p className="text-blue-600 font-medium">داخل: {formatCurrency(totalIn)}</p>
            <p className="text-red-500 font-medium">خارج: {formatCurrency(totalOut)}</p>
          </div>
          <p className="text-sm font-semibold">الداخل والخارج</p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-right py-1 text-xs w-16">النوع</TableHead>
            <TableHead className="text-right py-1 text-xs">البيان</TableHead>
            <TableHead className="text-right py-1 text-xs">المبلغ</TableHead>
            <TableHead className="text-right py-1 text-xs">التاريخ</TableHead>
            <TableHead className="w-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                لا يوجد بيانات — اضغط &quot;داخل&quot; أو &quot;خارج&quot; للإضافة
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const isIn = row.type === 'in'
            return (
              <TableRow key={row.id}>
                <TableCell className="py-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isIn ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                    {isIn ? 'داخل' : 'خارج'}
                  </span>
                </TableCell>
                <TableCell className="py-1 text-xs">{row.statement || '—'}</TableCell>
                <TableCell className={`py-1 text-xs font-medium ${isIn ? 'text-blue-600' : 'text-red-500'}`}>
                  {formatCurrency(row.amount)}
                </TableCell>
                <TableCell className="py-1 text-xs text-muted-foreground">{row.date}</TableCell>
                <TableCell className="py-1">
                  <button onClick={() => onDelete(row.id)}>
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                  </button>
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length > 0 && (
            <TableRow className="bg-muted/20 font-semibold text-xs">
              <TableCell className="py-1">الإجمالي</TableCell>
              <TableCell />
              <TableCell className="py-1">
                <span className="text-blue-600">{formatCurrency(totalIn)}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-red-500">{formatCurrency(totalOut)}</span>
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function ManagerClient() {
  const { push } = useUndo()

  const [principal, setPrincipal] = useState(0)
  const [investStart, setInvestStart] = useState(0)
  const [principalInput, setPrincipalInput] = useState('')
  const [investStartInput, setInvestStartInput] = useState('')

  const [transactions, setTransactions] = useState<ManagerTransaction[]>([])

  const [months, setMonths] = useState<ManagerMonth[]>([])
  const [monthReports, setMonthReports] = useState<Record<string, ManagerMonthReport[]>>({})
  const [monthTx, setMonthTx] = useState<Record<string, ManagerMonthTransaction[]>>({})
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [monthInvStart, setMonthInvStart] = useState<Record<string, string>>({})

  const [In1, setIn1] = useState(0)
  const [Out1, setOut1] = useState(0)

  const [txDialog, setTxDialog] = useState<{ open: boolean; type: 'in' | 'out'; monthId: string | null }>({ open: false, type: 'in', monthId: null })
  const [txForm, setTxForm] = useState({ amount: '', statement: '', date: today() })

  const [monthDialog, setMonthDialog] = useState(false)
  const [newMonthYM, setNewMonthYM] = useState(thisYM())

  const [reportDialog, setReportDialog] = useState<{ open: boolean; monthId: string | null }>({ open: false, monthId: null })
  const [reportForm, setReportForm] = useState({ profits: '', balance_after_profit: '', notes: '', date: today() })

  const loadAll = useCallback(async () => {
    const { data: settData } = await supabase.from('manager_settings').select('*')
    if (settData) {
      const p = settData.find((s) => s.key === 'principal')?.value ?? 0
      const i = settData.find((s) => s.key === 'invest_start')?.value ?? 0
      setPrincipal(Number(p))
      setInvestStart(Number(i))
      setPrincipalInput(String(p))
      setInvestStartInput(String(i))
    }

    const { data: txData } = await supabase
      .from('manager_transactions')
      .select('*')
      .order('date', { ascending: true })
    if (txData) setTransactions(txData)

    const { data: mData } = await supabase
      .from('manager_months')
      .select('*')
      .order('year_month', { ascending: false })
    if (mData) {
      setMonths(mData)
      const inv: Record<string, string> = {}
      mData.forEach((m) => { inv[m.id] = String(m.investment_start) })
      setMonthInvStart(inv)
    }

    const { data: repData } = await supabase
      .from('manager_month_reports')
      .select('*')
      .order('date', { ascending: true })
    if (repData) {
      const grouped: Record<string, ManagerMonthReport[]> = {}
      repData.forEach((r) => {
        if (!grouped[r.month_id]) grouped[r.month_id] = []
        grouped[r.month_id].push(r)
      })
      setMonthReports(grouped)
    }

    const { data: mtxData } = await supabase
      .from('manager_month_transactions')
      .select('*')
      .order('date', { ascending: true })
    if (mtxData) {
      const grouped: Record<string, ManagerMonthTransaction[]> = {}
      mtxData.forEach((r) => {
        if (!grouped[r.month_id]) grouped[r.month_id] = []
        grouped[r.month_id].push(r)
      })
      setMonthTx(grouped)
    }

    const [bankRes, credRes, catRes, priceSett, entriesRes, debtsRes] = await Promise.all([
      supabase.from('bank_accounts').select('balance'),
      supabase.from('creditors').select('amount'),
      supabase.from('categories').select('pieces_count'),
      supabase.from('settings').select('value').eq('key', 'unified_price').single(),
      supabase.from('investor_entries').select('type, amount'),
      supabase.from('debts').select('amount'),
    ])
    const bankTotal = (bankRes.data ?? []).reduce((s: number, r: { balance: number }) => s + (r.balance ?? 0), 0)
    const totalCreditors = (credRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0)
    const unifiedPrice = parseFloat(priceSett.data?.value ?? '50') || 50
    const totalPieces = (catRes.data ?? []).reduce((s: number, r: { pieces_count: number }) => s + (r.pieces_count ?? 0), 0)
    const inventoryValue = totalPieces * unifiedPrice
    const entries = (entriesRes.data ?? []) as { type: string; amount: number }[]
    const investorsNet = entries.filter(e => e.type === 'assets_in').reduce((s, e) => s + e.amount, 0)
                       + entries.filter(e => e.type === 'profit').reduce((s, e) => s + e.amount, 0)
                       - entries.filter(e => e.type === 'assets_out').reduce((s, e) => s + e.amount, 0)
    const totalDebts = (debtsRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0)
    setIn1(bankTotal + totalCreditors + inventoryValue)
    setOut1(investorsNet + totalDebts)
  }, [])

  useEffect(() => {
    loadAll()
    window.addEventListener('delta:refresh', loadAll as EventListener)
    return () => window.removeEventListener('delta:refresh', loadAll as EventListener)
  }, [loadAll])

  const totalIn = transactions.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0)
  const netOverall = principal + investStart + totalIn - totalOut
  const currentInvestBalance = totalOut - totalIn
  const currentInvestmentBalance = In1 - Out1
  const totalInvestment = investStart + (totalIn - totalOut)

  async function savePrincipal() {
    const val = parseFloat(principalInput)
    if (isNaN(val)) return
    await supabase.from('manager_settings').upsert({ key: 'principal', value: val }, { onConflict: 'key' })
    setPrincipal(val)
    toast.success('تم حفظ أصل المال')
  }

  async function saveInvestStart() {
    const val = parseFloat(investStartInput)
    if (isNaN(val)) return
    await supabase.from('manager_settings').upsert({ key: 'invest_start', value: val }, { onConflict: 'key' })
    setInvestStart(val)
    toast.success('تم حفظ بداية الاستثمار')
  }

  async function addTx() {
    const amount = parseFloat(txForm.amount) || 0
    const payload = {
      type: txDialog.type,
      amount,
      statement: txForm.statement || null,
      date: txForm.date,
    }

    if (txDialog.monthId) {
      // Monthly transaction
      const { data, error } = await supabase
        .from('manager_month_transactions')
        .insert({ ...payload, month_id: txDialog.monthId })
        .select().single()
      if (error) { toast.error('فشل الإضافة'); return }
      const mId = txDialog.monthId
      setMonthTx((prev) => ({ ...prev, [mId]: [...(prev[mId] ?? []), data as ManagerMonthTransaction] }))
      push({ label: 'إضافة معاملة شهرية', undo: async () => { await supabase.from('manager_month_transactions').delete().eq('id', data.id) } })
    } else {
      // General transaction
      const { data, error } = await supabase.from('manager_transactions').insert(payload).select().single()
      if (error) { toast.error('فشل الإضافة'); return }
      setTransactions((prev) => [...prev, data as ManagerTransaction])
      push({ label: 'إضافة معاملة عامة', undo: async () => { await supabase.from('manager_transactions').delete().eq('id', data.id) } })
    }

    setTxDialog((p) => ({ ...p, open: false }))
    setTxForm({ amount: '', statement: '', date: today() })
    toast.success('تم الإضافة')
  }

  async function deleteTx(id: string, monthId?: string) {
    if (monthId) {
      const tx = (monthTx[monthId] ?? []).find((t) => t.id === id)
      await supabase.from('manager_month_transactions').delete().eq('id', id)
      setMonthTx((prev) => ({ ...prev, [monthId]: (prev[monthId] ?? []).filter((t) => t.id !== id) }))
      if (tx) {
        push({ label: 'حذف معاملة شهرية', undo: async () => { await supabase.from('manager_month_transactions').insert({ month_id: tx.month_id, type: tx.type, amount: tx.amount, statement: tx.statement, date: tx.date }) } })
      }
    } else {
      const tx = transactions.find((t) => t.id === id)
      await supabase.from('manager_transactions').delete().eq('id', id)
      setTransactions((prev) => prev.filter((t) => t.id !== id))
      if (tx) {
        push({ label: 'حذف معاملة عامة', undo: async () => { await supabase.from('manager_transactions').insert({ type: tx.type, amount: tx.amount, statement: tx.statement, date: tx.date }) } })
      }
    }
  }

  async function importFromGeneral(monthId: string) {
    if (transactions.length === 0) { toast.error('لا يوجد بيانات في الجدول العام'); return }
    const alreadyImported = new Set((monthTx[monthId] ?? []).map((r) => r.source_tx_id).filter(Boolean))
    const toInsert = transactions.filter((t) => !alreadyImported.has(t.id))
    if (toInsert.length === 0) { toast.info('كل البيانات مستوردة بالفعل'); return }
    const inserts = toInsert.map((t) => ({
      month_id: monthId,
      type: t.type,
      amount: t.amount,
      statement: t.statement,
      date: t.date,
      source_tx_id: t.id,
    }))
    const { data, error } = await supabase
      .from('manager_month_transactions')
      .insert(inserts)
      .select()
    if (error) { toast.error('فشل الاستيراد'); return }
    setMonthTx((prev) => ({
      ...prev,
      [monthId]: [...(prev[monthId] ?? []), ...(data as ManagerMonthTransaction[])],
    }))
    toast.success(`تم استيراد ${inserts.length} بند جديد`)
  }

  async function addMonth() {
    const exists = months.find((m) => m.year_month === newMonthYM)
    if (exists) { toast.error('هذا الشهر موجود بالفعل'); return }
    const { data, error } = await supabase
      .from('manager_months')
      .insert({ year_month: newMonthYM, investment_start: 0, profits: 0 })
      .select().single()
    if (error) { toast.error('فشل الإضافة'); return }
    setMonths((prev) => [data, ...prev])
    setMonthInvStart((p) => ({ ...p, [data.id]: '0' }))
    setExpandedMonth(data.id)
    setMonthDialog(false)
    toast.success(`تم إضافة ${formatYM(newMonthYM)}`)
  }

  async function deleteMonth(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الشهر وجميع بياناته؟')) return
    await supabase.from('manager_months').delete().eq('id', id)
    setMonths((prev) => prev.filter((m) => m.id !== id))
    setMonthReports((prev) => { const n = { ...prev }; delete n[id]; return n })
    setMonthTx((prev) => { const n = { ...prev }; delete n[id]; return n })
    if (expandedMonth === id) setExpandedMonth(null)
    toast.success('تم الحذف')
  }

  async function saveMonthInvStart(id: string) {
    const val = parseFloat(monthInvStart[id]) || 0
    await supabase.from('manager_months').update({ investment_start: val }).eq('id', id)
    setMonths((prev) => prev.map((m) => m.id === id ? { ...m, investment_start: val } : m))
  }

  async function addReport() {
    if (!reportDialog.monthId) return
    const { data, error } = await supabase
      .from('manager_month_reports')
      .insert({
        month_id: reportDialog.monthId,
        amount_in: 0,
        amount_out: 0,
        profits: parseFloat(reportForm.profits) || 0,
        balance_after_profit: parseFloat(reportForm.balance_after_profit) || 0,
        notes: reportForm.notes || null,
        date: reportForm.date,
      })
      .select().single()
    if (error) { toast.error('فشل الإضافة'); return }
    setMonthReports((prev) => ({
      ...prev,
      [reportDialog.monthId!]: [...(prev[reportDialog.monthId!] ?? []), data as ManagerMonthReport],
    }))
    push({
      label: 'إضافة تقرير شهري',
      undo: async () => { await supabase.from('manager_month_reports').delete().eq('id', data.id) },
    })
    setReportDialog({ open: false, monthId: null })
    setReportForm({ profits: '', balance_after_profit: '', notes: '', date: today() })
    toast.success('تم الإضافة')
  }

  async function deleteReport(id: string, monthId: string) {
    const rep = (monthReports[monthId] ?? []).find((r) => r.id === id)
    await supabase.from('manager_month_reports').delete().eq('id', id)
    setMonthReports((prev) => ({ ...prev, [monthId]: (prev[monthId] ?? []).filter((r) => r.id !== id) }))
    if (rep) {
      push({
        label: 'حذف تقرير شهري',
        undo: async () => {
          await supabase.from('manager_month_reports').insert({
            month_id: rep.month_id,
            amount_in: rep.amount_in,
            amount_out: rep.amount_out,
            profits: rep.profits,
            balance_after_profit: rep.balance_after_profit,
            notes: rep.notes,
            date: rep.date,
          })
        },
      })
    }
  }

  return (
    <div className="p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setMonthDialog(true)}>
            <CalendarDays className="w-4 h-4 ml-1" />
            إضافة شهر
          </Button>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">صفحة المدير</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className={`rounded-lg p-3 ${totalInvestment >= 0 ? 'bg-violet-50 border border-violet-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className={`w-3.5 h-3.5 ${totalInvestment >= 0 ? 'text-violet-500' : 'text-red-500'}`} />
            <span className={`text-xs ${totalInvestment >= 0 ? 'text-violet-700' : 'text-red-600'}`}>إجمالي الاستثمار</span>
          </div>
          <p className={`text-xl font-bold ${totalInvestment >= 0 ? 'text-violet-600' : 'text-red-500'}`}>{formatCurrency(totalInvestment)}</p>
          <p className={`text-xs mt-0.5 ${totalInvestment >= 0 ? 'text-violet-400' : 'text-red-400'}`}>بداية + (داخل − خارج)</p>
        </div>
        <div className="bg-primary text-primary-foreground rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 opacity-80" />
            <span className="text-xs opacity-80">المال العام الإجمالي</span>
          </div>
          <p className="text-xl font-bold">{formatCurrency(netOverall)}</p>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">أصل المال</span>
          </div>
          <p className="text-xl font-bold">{formatCurrency(principal)}</p>
        </div>
        <div className={`rounded-lg p-3 ${currentInvestBalance >= 0 ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className={`w-3.5 h-3.5 ${currentInvestBalance >= 0 ? 'text-amber-500' : 'text-red-500'}`} />
            <span className={`text-xs ${currentInvestBalance >= 0 ? 'text-amber-700' : 'text-red-600'}`}>سحب المدير</span>
          </div>
          <p className={`text-xl font-bold ${currentInvestBalance >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{formatCurrency(currentInvestBalance)}</p>
          <p className={`text-xs mt-0.5 ${currentInvestBalance >= 0 ? 'text-amber-500' : 'text-red-400'}`}>خارج − داخل</p>
        </div>
        <div className={`rounded-lg p-3 ${currentInvestmentBalance >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingDown className={`w-3.5 h-3.5 ${currentInvestmentBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
            <span className={`text-xs ${currentInvestmentBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>رصيد الاستثمار الحالي</span>
          </div>
          <p className={`text-xl font-bold ${currentInvestmentBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(currentInvestmentBalance)}</p>
          <p className={`text-xs mt-0.5 ${currentInvestmentBalance >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>In1 − Out1</p>
        </div>
      </div>

      {/* General section */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-3 border-b flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">أصل المال:</span>
              <Input
                type="number"
                value={principalInput}
                onChange={(e) => setPrincipalInput(e.target.value)}
                onBlur={savePrincipal}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="w-32 h-7 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">بداية الاستثمار:</span>
              <Input
                type="number"
                value={investStartInput}
                onChange={(e) => setInvestStartInput(e.target.value)}
                onBlur={saveInvestStart}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                className="w-32 h-7 text-sm"
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">الإجمالي العام</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(netOverall)}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(principal)} + {formatCurrency(investStart)} + {formatCurrency(totalIn)} − {formatCurrency(totalOut)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <TxTable
            rows={transactions}
            type="in"
            onAdd={() => { setTxDialog({ open: true, type: 'in', monthId: null }); setTxForm({ amount: '', statement: '', date: today() }) }}
            onDelete={(id) => deleteTx(id)}
          />
          <TxTable
            rows={transactions}
            type="out"
            onAdd={() => { setTxDialog({ open: true, type: 'out', monthId: null }); setTxForm({ amount: '', statement: '', date: today() }) }}
            onDelete={(id) => deleteTx(id)}
          />
        </div>
      </div>

      {/* Monthly sections */}
      {months.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-right text-muted-foreground">الأشهر</p>
          {months.map((month) => {
            const mRep = monthReports[month.id] ?? []
            const mTxRows = monthTx[month.id] ?? []
            const mIn = mTxRows.filter((r) => r.type === 'in').reduce((s, r) => s + r.amount, 0)
            const mOut = mTxRows.filter((r) => r.type === 'out').reduce((s, r) => s + r.amount, 0)
            const mProfits = mRep.reduce((s, r) => s + r.profits, 0)
            const isExpanded = expandedMonth === month.id

            return (
              <div key={month.id} className="bg-white border rounded-xl overflow-hidden">
                {/* Month header */}
                <div
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedMonth(isExpanded ? null : month.id)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMonth(month.id) }}
                      className="p-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-primary" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-left space-y-0.5">
                      <p className="text-xs text-blue-600">داخل: {formatCurrency(mIn)}</p>
                      <p className="text-xs text-red-500">خارج: {formatCurrency(mOut)}</p>
                      <p className="text-xs text-purple-600">أرباح: {formatCurrency(mProfits)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold">{formatYM(month.year_month)}</p>
                      <p className="text-xs text-muted-foreground">
                        بداية: {formatCurrency(month.investment_start)} | {mTxRows.length} بند
                      </p>
                    </div>
                  </div>
                </div>

                {/* Month detail */}
                {isExpanded && (
                  <div className="border-t p-3 space-y-3 bg-muted/5">
                    {/* بداية الاستثمار */}
                    <div className="flex items-center gap-3 bg-white border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">بداية الاستثمار:</span>
                        <Input
                          type="number"
                          value={monthInvStart[month.id] ?? ''}
                          onChange={(e) => setMonthInvStart((p) => ({ ...p, [month.id]: e.target.value }))}
                          onBlur={() => saveMonthInvStart(month.id)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                          className="w-32 h-7 text-sm"
                        />
                      </div>
                    </div>

                    {/* Combined داخل/خارج table */}
                    <CombinedTxTable
                      rows={mTxRows}
                      onAddIn={() => {
                        setTxDialog({ open: true, type: 'in', monthId: month.id })
                        setTxForm({ amount: '', statement: '', date: today() })
                      }}
                      onAddOut={() => {
                        setTxDialog({ open: true, type: 'out', monthId: month.id })
                        setTxForm({ amount: '', statement: '', date: today() })
                      }}
                      onDelete={(id) => deleteTx(id, month.id)}
                      onImport={() => importFromGeneral(month.id)}
                    />

                    {/* Profits reports table */}
                    <div className="bg-white border rounded-xl overflow-hidden">
                      <div className="p-3 border-b flex items-center justify-between">
                        <button
                          onClick={() => {
                            setReportDialog({ open: true, monthId: month.id })
                            setReportForm({ profits: '', balance_after_profit: '', notes: '', date: today() })
                          }}
                          className="flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors bg-teal-600 hover:bg-teal-700"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          إضافة تقرير أرباح
                        </button>
                        <div className="flex items-center gap-2 text-right">
                          <p className="text-sm font-semibold">تقارير الأرباح</p>
                          <FileText className="w-4 h-4 text-teal-600" />
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-right py-1 text-xs w-24">التاريخ</TableHead>
                            <TableHead className="text-right py-1 text-xs text-purple-600">الأرباح</TableHead>
                            <TableHead className="text-right py-1 text-xs">الرصيد بعد الأرباح</TableHead>
                            <TableHead className="text-right py-1 text-xs">ملاحظات</TableHead>
                            <TableHead className="w-6" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mRep.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                                لا يوجد تقارير — اضغط &quot;إضافة تقرير أرباح&quot; للبدء
                              </TableCell>
                            </TableRow>
                          )}
                          {mRep.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="py-1 text-xs text-muted-foreground">{row.date}</TableCell>
                              <TableCell className="py-1 text-xs font-medium text-purple-600">{formatCurrency(row.profits)}</TableCell>
                              <TableCell className="py-1 text-xs font-medium">{formatCurrency(row.balance_after_profit)}</TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">{row.notes || '—'}</TableCell>
                              <TableCell className="py-1">
                                <button onClick={() => deleteReport(row.id, month.id)}>
                                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {mRep.length > 0 && (
                            <TableRow className="bg-muted/20 font-semibold text-xs">
                              <TableCell className="py-1">الإجمالي</TableCell>
                              <TableCell className="py-1 text-purple-600">{formatCurrency(mProfits)}</TableCell>
                              <TableCell colSpan={3} />
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Transaction Dialog (general + monthly) */}
      <Dialog open={txDialog.open} onOpenChange={(open) => setTxDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              إضافة — {txDialog.type === 'in' ? 'داخل' : 'خارج'}
              {txDialog.monthId ? ' (شهري)' : ' (عام)'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addTx() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ج.م)</label>
              <Input
                type="number"
                value={txForm.amount}
                onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">البيان</label>
              <Input
                value={txForm.statement}
                onChange={(e) => setTxForm((f) => ({ ...f, statement: e.target.value }))}
                placeholder="البيان..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setTxDialog((p) => ({ ...p, open: false }))}>إلغاء</Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Month Dialog */}
      <Dialog open={monthDialog} onOpenChange={setMonthDialog}>
        <DialogContent className="sm:max-w-xs" dir="rtl">
          <DialogHeader><DialogTitle>إضافة شهر جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addMonth() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">الشهر والسنة</label>
              <Input
                type="month"
                value={newMonthYM}
                onChange={(e) => setNewMonthYM(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setMonthDialog(false)}>إلغاء</Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Report Dialog (profits only) */}
      <Dialog open={reportDialog.open} onOpenChange={(open) => setReportDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة تقرير أرباح</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addReport() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input
                type="date"
                value={reportForm.date}
                onChange={(e) => setReportForm((f) => ({ ...f, date: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block text-purple-600">الأرباح (ج.م)</label>
                <Input
                  type="number"
                  value={reportForm.profits}
                  onChange={(e) => setReportForm((f) => ({ ...f, profits: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">الرصيد بعد الأرباح (ج.م)</label>
                <Input
                  type="number"
                  value={reportForm.balance_after_profit}
                  onChange={(e) => setReportForm((f) => ({ ...f, balance_after_profit: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Input
                value={reportForm.notes}
                onChange={(e) => setReportForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setReportDialog({ open: false, monthId: null })}>إلغاء</Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
