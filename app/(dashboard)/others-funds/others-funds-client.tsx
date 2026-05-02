'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { OthersFund } from '@/lib/database.types'
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
import { Plus, Trash2, RefreshCw, Wallet, TrendingUp } from 'lucide-react'
import { useUndo } from '@/lib/undo-context'

function today() {
  return new Date().toISOString().split('T')[0]
}

function fmt(n: number, decimals = 3): string {
  if (n === 0) return '0'
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

function fmtRatio(n: number): string {
  return n.toFixed(10)
}

function calcRow(row: OthersFund) {
  const manager_balance_start = row.manager_capital + row.manager_additional_funds
  const profit        = row.share_ratio > 0 ? row.current_profit / row.share_ratio : 0
  const final_profit  = profit / 2
  const final_balance = row.investor_balance_start + final_profit
  return { manager_balance_start, profit, final_profit, final_balance }
}

// Editable fields (manager_balance_start excluded — it's now computed)
type EditKey = 'manager_capital' | 'manager_additional_funds' | 'investor_balance_start' | 'share_ratio' | 'current_profit' | 'date'
const numericFields: EditKey[] = ['manager_capital', 'manager_additional_funds', 'investor_balance_start', 'share_ratio', 'current_profit']

// ────── Inline editable cell ──────
interface EditableCellProps {
  rowId: string
  field: EditKey
  value: number | string
  display: string
  type?: 'number' | 'date'
  step?: string
  className?: string
  active: boolean
  editValue: string
  onStart: (rowId: string, field: EditKey, current: string) => void
  onChange: (v: string) => void
  onSave: () => void
}

function EditableCell({
  rowId, field, display, type = 'number', step = '0.000001',
  className = '', active, editValue, onStart, onChange, onSave, value,
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (active) inputRef.current?.select() }, [active])

  return (
    <TableCell
      className={`py-0 cursor-text group ${className}`}
      onClick={() => !active && onStart(rowId, field, String(value))}
    >
      {active ? (
        <input
          ref={inputRef}
          type={type}
          step={step}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onSave() }
            if (e.key === 'Escape') onSave()
          }}
          className="w-full min-w-[80px] h-7 text-xs bg-transparent border-b-2 border-primary outline-none px-0"
          autoFocus
        />
      ) : (
        <span className="block py-1.5 min-h-[28px] group-hover:text-primary transition-colors">
          {display}
        </span>
      )}
    </TableCell>
  )
}

const emptyForm = {
  date: '',
  manager_capital: '',
  manager_additional_funds: '',
  investor_balance_start: '',
  current_profit: '',
  notes: '',
}

export function OthersFundsClient() {
  const { push } = useUndo()

  const [rows, setRows]                   = useState<OthersFund[]>([])
  const [investorsNetTotal, setInvestorsNetTotal] = useState(0)
  const [dialog, setDialog]               = useState(false)
  const [form, setForm]                   = useState({ ...emptyForm, date: today() })
  const [editingCell, setEditingCell]     = useState<{ rowId: string; field: EditKey } | null>(null)
  const [editingValue, setEditingValue]   = useState('')

  const loadAll = useCallback(async () => {
    const [fundsRes, entriesRes] = await Promise.all([
      supabase.from('others_funds').select('*').order('date', { ascending: true }),
      supabase.from('investor_entries').select('type, amount'),
    ])

    if (fundsRes.data) setRows(fundsRes.data)

    // إجمالي الصافى من صفحة المستثمرون
    const entries = (entriesRes.data ?? []) as { type: string; amount: number }[]
    const net =
      entries.filter(e => e.type === 'assets_in').reduce((s, e) => s + e.amount, 0) +
      entries.filter(e => e.type === 'profit').reduce((s, e) => s + e.amount, 0) -
      entries.filter(e => e.type === 'assets_out').reduce((s, e) => s + e.amount, 0)
    setInvestorsNetTotal(net)
  }, [])

  useEffect(() => {
    loadAll()
    window.addEventListener('delta:refresh', loadAll as EventListener)
    return () => window.removeEventListener('delta:refresh', loadAll as EventListener)
  }, [loadAll])

  const computed = rows.map(calcRow)

  const totalInvestorProfit = computed.reduce((s, r) => s + r.final_profit, 0)
  const totalManagerProfit  = computed.reduce((s, r) => s + r.final_profit, 0)
  const totalCurrentProfit  = rows.reduce((s, r) => s + r.current_profit, 0)

  // live preview
  const previewCapital       = parseFloat(form.manager_capital) || 0
  const previewAdditional    = parseFloat(form.manager_additional_funds) || 0
  const previewMgrBalance    = previewCapital + previewAdditional
  const previewInvestorStart = parseFloat(form.investor_balance_start) || 0
  // عدد الاسهم = (رصيد البداية للمستثمر + رصيد البداية للمدير) / رصيد البداية للمستثمر
  const computedShareRatio   = previewInvestorStart > 0
    ? (previewInvestorStart + previewMgrBalance) / previewInvestorStart
    : 0
  const previewCurrentProfit = parseFloat(form.current_profit) || 0
  const previewProfit        = computedShareRatio > 0 ? previewCurrentProfit / computedShareRatio : 0
  const previewFinalProfit   = previewProfit / 2
  const previewFinalBalance  = previewInvestorStart + previewFinalProfit
  const showPreview          = computedShareRatio > 0 && previewCurrentProfit > 0

  // ── Inline edit ──
  function startEdit(rowId: string, field: EditKey, current: string) {
    setEditingCell({ rowId, field })
    setEditingValue(current)
  }

  async function saveEdit() {
    if (!editingCell) return
    const { rowId, field } = editingCell
    const isNum = numericFields.includes(field)
    const value = isNum ? (parseFloat(editingValue) || 0) : editingValue

    // Auto-recompute manager_balance_start when its inputs change
    const row = rows.find(r => r.id === rowId)!
    const updates: Record<string, number | string> = { [field]: value }
    if (field === 'manager_capital' || field === 'manager_additional_funds') {
      const cap = field === 'manager_capital' ? (value as number) : row.manager_capital
      const add = field === 'manager_additional_funds' ? (value as number) : row.manager_additional_funds
      updates.manager_balance_start = cap + add
    }

    const { error } = await supabase.from('others_funds').update(updates).eq('id', rowId)
    if (error) { toast.error('فشل الحفظ'); setEditingCell(null); return }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r))
    setEditingCell(null)
  }

  function isActive(rowId: string, field: EditKey) {
    return editingCell?.rowId === rowId && editingCell?.field === field
  }

  // ── Add row ──
  async function addRow() {
    const cap = parseFloat(form.manager_capital) || 0
    const add = parseFloat(form.manager_additional_funds) || 0
    const mgrBalance = cap + add
    const invBalance = parseFloat(form.investor_balance_start) || 0
    const shareRatio = invBalance > 0 ? (invBalance + mgrBalance) / invBalance : 0
    const payload = {
      date:                     form.date,
      manager_capital:          cap,
      manager_additional_funds: add,
      manager_balance_start:    mgrBalance,
      investor_balance_start:   invBalance,
      share_ratio:              shareRatio,   // auto-computed
      current_profit:           parseFloat(form.current_profit) || 0,
      notes:                    form.notes || null,
    }
    const { data, error } = await supabase.from('others_funds').insert(payload).select().single()
    if (error) { toast.error('فشل الإضافة'); return }
    setRows(prev => [...prev, data as OthersFund])
    push({ label: 'إضافة سجل اموال الغير', undo: async () => { await supabase.from('others_funds').delete().eq('id', data.id) } })
    setDialog(false)
    toast.success('تم الإضافة')
  }

  async function deleteRow(id: string) {
    const row = rows.find(r => r.id === id)
    await supabase.from('others_funds').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
    if (row) {
      push({
        label: 'حذف سجل اموال الغير',
        undo: async () => {
          await supabase.from('others_funds').insert({
            date: row.date, manager_capital: row.manager_capital,
            manager_additional_funds: row.manager_additional_funds,
            manager_balance_start: row.manager_balance_start,
            investor_balance_start: row.investor_balance_start,
            share_ratio: row.share_ratio, current_profit: row.current_profit,
            notes: row.notes,
          })
        },
      })
    }
    toast.success('تم الحذف')
  }

  function openDialog() {
    setForm({
      date: today(),
      manager_capital: '',
      manager_additional_funds: '',
      investor_balance_start: investorsNetTotal > 0 ? String(investorsNetTotal) : '',
      current_profit: '',
      notes: '',
    })
    setDialog(true)
  }

  function fld(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  const ep = (rowId: string, f: EditKey) => ({
    rowId, field: f, active: isActive(rowId, f),
    editValue: editingValue, onStart: startEdit, onChange: setEditingValue, onSave: saveEdit,
  })

  return (
    <div className="p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="w-4 h-4 ml-1" />تحديث
          </Button>
          <Button size="sm" onClick={openDialog}>
            <Plus className="w-4 h-4 ml-1" />إضافة سجل
          </Button>
        </div>
        <h1 className="text-xl font-bold">حساب اموال الغير</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-blue-700">الرصيد الحال للمستثمر</span>
          </div>
          <p className="text-lg font-bold text-blue-600">{fmt(investorsNetTotal)}</p>
          <p className="text-xs text-blue-400 mt-0.5">إجمالي الصافى — صفحة المستثمرون</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-700">ربح المستثمر المتراكم</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{fmt(totalInvestorProfit)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-amber-700">ربح المدير المتراكم</span>
          </div>
          <p className="text-lg font-bold text-amber-600">{fmt(totalManagerProfit)}</p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">إجمالي الربح الحالى</span>
          </div>
          <p className="text-lg font-bold">{fmt(totalCurrentProfit)}</p>
        </div>
      </div>

      {/* Main table */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-amber-50">
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">رصيد مال نهائي</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">ربح نهائي</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">ربح</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">الربح الحالى</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">عدد الاسهم</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">التاريخ</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">رصيد البداية للمستثمر</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">رصيد البداية للمدير</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">اموال اضافية من المدير</TableHead>
              <TableHead className="text-right py-2 text-xs font-bold whitespace-nowrap">اصل المال للمدير</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-10">
                  لا يوجد بيانات — اضغط &quot;إضافة سجل&quot; للبدء
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => {
              const c = computed[i]
              return (
                <TableRow key={row.id} className="text-xs">
                  {/* Computed — read-only */}
                  <TableCell className="py-1.5 font-bold text-blue-700">{fmt(c.final_balance)}</TableCell>
                  <TableCell className="py-1.5 font-medium text-emerald-700">{fmt(c.final_profit)}</TableCell>
                  <TableCell className="py-1.5">{fmt(c.profit)}</TableCell>

                  {/* Editable */}
                  <EditableCell {...ep(row.id, 'current_profit')} value={row.current_profit} display={fmt(row.current_profit)} />
                  <EditableCell {...ep(row.id, 'share_ratio')} value={row.share_ratio} display={fmtRatio(row.share_ratio)} step="0.0000000001" className="font-mono text-[11px]" />
                  <EditableCell {...ep(row.id, 'date')} value={row.date} display={row.date} type="date" step="" className="text-muted-foreground" />
                  <EditableCell {...ep(row.id, 'investor_balance_start')} value={row.investor_balance_start} display={fmt(row.investor_balance_start)} className="font-medium" />

                  {/* manager_balance_start — computed, read-only */}
                  <TableCell className="py-1.5 text-muted-foreground">{fmt(c.manager_balance_start)}</TableCell>

                  {/* Editable — these two auto-update manager_balance_start */}
                  <EditableCell {...ep(row.id, 'manager_additional_funds')} value={row.manager_additional_funds} display={fmt(row.manager_additional_funds)} className="text-muted-foreground" />
                  <EditableCell {...ep(row.id, 'manager_capital')} value={row.manager_capital} display={fmt(row.manager_capital)} className="text-muted-foreground" />

                  <TableCell className="py-1.5">
                    <button onClick={() => deleteRow(row.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length > 0 && (
              <TableRow className="bg-amber-50 font-bold text-xs">
                <TableCell className="py-1.5 text-blue-700">{fmt(computed[computed.length - 1]?.final_balance ?? 0)}</TableCell>
                <TableCell className="py-1.5 text-emerald-700">{fmt(totalInvestorProfit)}</TableCell>
                <TableCell className="py-1.5">{fmt(computed.reduce((s, r) => s + r.profit, 0))}</TableCell>
                <TableCell className="py-1.5">{fmt(totalCurrentProfit)}</TableCell>
                <TableCell colSpan={7} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إضافة سجل جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addRow() }} className="space-y-3 mt-2">

            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input type="date" {...fld('date')} />
            </div>

            <div className="p-3 border rounded-lg space-y-3 bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground">بيانات المدير</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">اصل المال للمدير</label>
                  <Input type="number" step="0.000001" {...fld('manager_capital')} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">اموال اضافية من المدير</label>
                  <Input type="number" step="0.000001" {...fld('manager_additional_funds')} placeholder="0" />
                </div>
              </div>
              {(previewCapital > 0 || previewAdditional > 0) && (
                <p className="text-xs text-muted-foreground">
                  رصيد البداية للمدير (محسوب):
                  <span className="font-bold text-foreground mr-1">{fmt(previewMgrBalance)}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">رصيد البداية للمستثمر</label>
                <Input type="number" step="0.000001" {...fld('investor_balance_start')} placeholder="0" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">عدد الاسهم (محسوب)</label>
                <div className="h-9 flex items-center px-3 border rounded-md bg-muted/30 text-sm font-mono">
                  {computedShareRatio > 0 ? fmtRatio(computedShareRatio) : <span className="text-muted-foreground text-xs">يُحسب تلقائياً</span>}
                </div>
                {computedShareRatio > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ({fmt(previewInvestorStart)} + {fmt(previewMgrBalance)}) ÷ {fmt(previewInvestorStart)}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">الربح الحالى</label>
              <Input type="number" step="0.000001" {...fld('current_profit')} placeholder="0" />
              {showPreview && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="bg-muted/20 rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">ربح</p>
                    <p className="text-sm font-bold">{fmt(previewProfit)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-emerald-600">ربح نهائي</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(previewFinalProfit)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-blue-600">رصيد مال نهائي</p>
                    <p className="text-sm font-bold text-blue-700">{fmt(previewFinalBalance)}</p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Input {...fld('notes')} placeholder="ملاحظات..." />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>إلغاء</Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
