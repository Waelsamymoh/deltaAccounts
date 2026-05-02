'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { BankAccount } from '@/lib/database.types'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus,
  RefreshCw,
  Search,
  Copy,
  GripVertical,
  Pencil,
  Trash2,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Users,
  AlertCircle,
  Wallet,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useUndo } from '@/lib/undo-context'

const BANKS = [
  'بنك الإسكندرية',
  'البنك الأهلي المصري',
  'بنك مصر',
  'بنك القاهرة',
  'البنك التجاري الدولي',
  'بنك HSBC',
  'بنك العربي الأفريقي',
  'بنك قطر الوطني الأهلي',
  'بنك المشرق',
  'أخرى',
]

const EMPTY_FORM = {
  client_name: '',
  bank_name: '',
  account_number: '',
  iban: '',
  phone: '',
  balance: '',
}

export function BankAccountsClient() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Filters
  const [search, setSearch] = useState('')
  const [bankFilter, setBankFilter] = useState('all')
  const [balanceMin, setBalanceMin] = useState('')
  const [balanceMax, setBalanceMax] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Discount inputs per row
  const [discounts, setDiscounts] = useState<Record<string, number>>({})

  // Inline balance editing
  const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>({})

  const { push } = useUndo()

  async function saveBalance(id: string) {
    const raw = balanceInputs[id]
    if (raw === undefined) return
    const val = parseFloat(raw)
    if (isNaN(val)) return
    const { error } = await supabase.from('bank_accounts').update({ balance: val }).eq('id', id)
    if (error) {
      toast.error(`فشل حفظ الرصيد: ${error.message}`)
    } else {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, balance: val } : a)))
      setBalanceInputs((prev) => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  const sensors = useSensors(useSensor(PointerSensor))

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    let { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('position', { ascending: true })
    if (error) {
      // position column may not exist yet — fall back to created_at
      const fallback = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at', { ascending: true })
      data = fallback.data
      error = fallback.error
    }
    if (error) {
      toast.error('فشل تحميل الحسابات')
    } else {
      setAccounts(data || [])
      setLastUpdated(new Date())
    }
    setLoading(false)
  }, [])

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = accounts.findIndex((a) => a.id === active.id)
    const newIndex = accounts.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(accounts, oldIndex, newIndex)

    setAccounts(reordered)

    // Persist new positions
    await Promise.all(
      reordered.map((acc, i) =>
        supabase.from('bank_accounts').update({ position: i + 1 }).eq('id', acc.id)
      )
    )
  }

  useEffect(() => {
    fetchAccounts()
    window.addEventListener('delta:refresh', fetchAccounts as EventListener)
    return () => window.removeEventListener('delta:refresh', fetchAccounts as EventListener)
  }, [fetchAccounts])

  const filteredAccounts = accounts.filter((acc) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      (acc.client_name ?? '').toLowerCase().includes(q) ||
      (acc.account_number ?? '').includes(q) ||
      (acc.phone ?? '').includes(q) ||
      (acc.iban ?? '').toLowerCase().includes(q)
    const matchBank = bankFilter === 'all' || acc.bank_name === bankFilter
    const matchMin = !balanceMin || (acc.balance ?? 0) >= parseFloat(balanceMin)
    const matchMax = !balanceMax || (acc.balance ?? 0) <= parseFloat(balanceMax)
    return matchSearch && matchBank && matchMin && matchMax
  })

  const totalBalance = filteredAccounts.reduce((s, a) => s + a.balance, 0)
  const zeroBalanceCount = accounts.filter((a) => a.balance === 0).length
  const uniqueBanks = [...new Set(accounts.map((a) => a.bank_name))]

  function openCreate() {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(acc: BankAccount) {
    setEditingAccount(acc)
    setForm({
      client_name: acc.client_name,
      bank_name: acc.bank_name,
      account_number: acc.account_number,
      iban: acc.iban || '',
      phone: acc.phone || '',
      balance: String(acc.balance),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.client_name || !form.bank_name || !form.account_number) {
      toast.error('يرجى ملء الحقول المطلوبة')
      return
    }
    setSaving(true)
    const payload = {
      client_name: form.client_name,
      bank_name: form.bank_name,
      account_number: form.account_number,
      iban: form.iban || null,
      phone: form.phone || null,
      balance: parseFloat(form.balance) || 0,
    }

    if (editingAccount) {
      const { error } = await supabase
        .from('bank_accounts')
        .update(payload)
        .eq('id', editingAccount.id)
      if (error) {
        console.error('Update error:', error)
        toast.error(`فشل التحديث: ${error.message}`)
      } else {
        toast.success('تم التحديث بنجاح')
        setDialogOpen(false)
        fetchAccounts()
      }
    } else {
      const { data, error } = await supabase.from('bank_accounts').insert(payload).select().single()
      if (error) {
        console.error('Insert error:', error)
        toast.error(`فشل الإضافة: ${error.message}`)
      } else {
        toast.success('تم الإضافة بنجاح')
        setDialogOpen(false)
        fetchAccounts()
        push({ label: `إضافة حساب: ${data.client_name}`, undo: async () => { await supabase.from('bank_accounts').delete().eq('id', data.id) } })
      }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الحساب؟')) return
    const deleted = accounts.find(a => a.id === id)
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
    if (error) toast.error('فشل الحذف')
    else {
      toast.success('تم الحذف')
      fetchAccounts()
      if (deleted) push({ label: `حذف حساب: ${deleted.client_name}`, undo: async () => { await supabase.from('bank_accounts').insert({ client_name: deleted.client_name, bank_name: deleted.bank_name, account_number: deleted.account_number, iban: deleted.iban, phone: deleted.phone, balance: deleted.balance }) } })
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast.success('تم النسخ')
  }

  function exportExcel() {
    const data = filteredAccounts.map((a) => ({
      'اسم العميل': a.client_name,
      'رقم الحساب': a.account_number,
      IBAN: a.iban || '',
      البنك: a.bank_name,
      'رقم الهاتف': a.phone || '',
      'الرصيد (ج.م)': a.balance,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'الحسابات')
    XLSX.writeFile(wb, 'bank_accounts.xlsx')
  }

  function exportCSV() {
    const data = filteredAccounts.map((a) => ({
      'اسم العميل': a.client_name,
      'رقم الحساب': a.account_number,
      IBAN: a.iban || '',
      البنك: a.bank_name,
      'رقم الهاتف': a.phone || '',
      'الرصيد (ج.م)': a.balance,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bank_accounts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const timeStr = lastUpdated.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAccounts}>
            <RefreshCw className="w-4 h-4 ml-1" />تحديث
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 ml-1" />إضافة حساب
          </Button>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">الحسابات البنكية</h1>
          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            آخر تحديث الساعة {timeStr}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-900 text-white rounded-xl p-4 border-r-4 border-orange-500">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-gray-400">إجمالي الأرصدة</span>
          </div>
          <p className="text-2xl font-bold text-orange-400">{formatCurrency(totalBalance)}</p>
        </div>
        <div className="bg-gray-900 text-white rounded-xl p-4 border-r-4 border-orange-500/60">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-orange-300" />
            <span className="text-xs text-gray-400">إجمالي الحسابات</span>
          </div>
          <p className="text-2xl font-bold text-white">{accounts.length}</p>
          <p className="text-xs text-gray-500 mt-1">حساب مسجل</p>
        </div>
        <div className="bg-gray-900 text-white rounded-xl p-4 border-r-4 border-orange-500/60">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-orange-300" />
            <span className="text-xs text-gray-400">متوسط الرصيد</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {accounts.length ? formatCurrency(totalBalance / accounts.length) : formatCurrency(0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">لكل حساب</p>
        </div>
        <div className="bg-gray-900 text-white rounded-xl p-4 border-r-4 border-red-500/70">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-gray-400">رصيد صفري</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{zeroBalanceCount}</p>
          <p className="text-xs text-gray-500 mt-1">تحتاج مراجعة</p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {/* Table header bar */}
        <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs border-orange-500/50 text-orange-400 hover:bg-orange-500/10" onClick={exportExcel}>
              <FileSpreadsheet className="w-3.5 h-3.5 ml-1" />Excel
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700" onClick={exportCSV}>
              <FileText className="w-3.5 h-3.5 ml-1" />CSV
            </Button>
          </div>
          <div className="flex items-center gap-3 text-white">
            <span className="text-xs text-gray-400">{filteredAccounts.length} حساب</span>
            <h2 className="font-semibold text-sm">قائمة الحسابات</h2>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b bg-gray-50 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث باسم العميل، رقم الحساب..." className="pr-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={bankFilter} onValueChange={(v: string | null) => setBankFilter(v ?? 'all')}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="كل البنوك" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البنوك</SelectItem>
              {uniqueBanks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>رصيد:</span>
            <Input placeholder="من" className="w-20 h-9" value={balanceMin} onChange={(e) => setBalanceMin(e.target.value)} type="number" />
            <span>—</span>
            <Input placeholder="إلى" className="w-20 h-9" value={balanceMax} onChange={(e) => setBalanceMax(e.target.value)} type="number" />
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow className="bg-orange-500/10 border-b-2 border-orange-500/30">
                <TableHead className="w-10 text-center text-xs">ترتيب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">اسم العميل</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">رقم الحساب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">رقم الهاتف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">البنك</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">الرصيد</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">المبلغ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">بعد الخصم</TableHead>
                <TableHead className="text-right text-xs font-semibold text-gray-700">بعد الإضافة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <SortableContext items={filteredAccounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                ) : filteredAccounts.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">لا توجد حسابات</TableCell></TableRow>
                ) : (
                  filteredAccounts.map((acc) => (
                    <SortableRow
                      key={acc.id}
                      acc={acc}
                      discount={discounts[acc.id] || 0}
                      balanceInput={balanceInputs[acc.id]}
                      onDiscountChange={(v) => setDiscounts((d) => ({ ...d, [acc.id]: v }))}
                      onBalanceChange={(v) => setBalanceInputs((prev) => ({ ...prev, [acc.id]: v }))}
                      onBalanceBlur={() => saveBalance(acc.id)}
                      onEdit={() => openEdit(acc)}
                      onDelete={() => handleDelete(acc.id)}
                      onCopy={copyToClipboard}
                    />
                  ))
                )}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>

        <div className="px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">إجمالي {accounts.length} حساب</span>
          <span className="text-xs font-semibold text-orange-600">{formatCurrency(totalBalance)}</span>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'تعديل الحساب' : 'إضافة حساب جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم العميل *</label>
              <Input
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                placeholder="اسم العميل"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">البنك *</label>
              <Select
                value={form.bank_name}
                onValueChange={(v: string | null) => setForm((f) => ({ ...f, bank_name: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر البنك" />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">رقم الحساب *</label>
              <Input
                value={form.account_number}
                onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                placeholder="رقم الحساب"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">IBAN</label>
              <Input
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                placeholder="EG..."
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">رقم الهاتف</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="01..."
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الرصيد (ج.م)</label>
              <Input
                type="number"
                value={form.balance}
                onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'جاري الحفظ...' : editingAccount ? 'تحديث' : 'إضافة'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---- Sortable row component ----
interface SortableRowProps {
  acc: BankAccount
  discount: number
  balanceInput: string | undefined
  onDiscountChange: (v: number) => void
  onBalanceChange: (v: string) => void
  onBalanceBlur: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy: (text: string) => void
}

function SortableRow({
  acc, discount, balanceInput,
  onDiscountChange, onBalanceChange, onBalanceBlur,
  onEdit, onDelete, onCopy,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: acc.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const afterDiscount = discount ? acc.balance - discount : null
  const afterAdd = discount ? acc.balance + discount : null

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 touch-none"
          title="اسحب لإعادة الترتيب"
        >
          <GripVertical className="w-5 h-5" />
        </button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
            {acc.client_name?.charAt(0) ?? '؟'}
          </div>
          <span className="font-medium">{acc.client_name ?? '—'}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-sm font-mono">{acc.account_number}</span>
          <button onClick={() => onCopy(acc.account_number)}>
            <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        {acc.iban && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-muted-foreground font-mono">...{acc.iban.slice(-8)}</span>
            <button onClick={() => onCopy(acc.iban!)}>
              <Copy className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </TableCell>
      <TableCell>
        {acc.phone && (
          <div className="flex items-center gap-1">
            <span className="text-sm">{acc.phone}</span>
            <button onClick={() => onCopy(acc.phone!)}>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">{acc.bank_name}</Badge>
      </TableCell>
      <TableCell>
        <div className="relative">
          <Input
            type="number"
            className="w-36 h-8 text-sm font-bold text-orange-600 border-transparent hover:border-input focus:border-input"
            value={balanceInput ?? (acc.balance ?? 0)}
            onChange={(e) => onBalanceChange(e.target.value)}
            onBlur={onBalanceBlur}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          placeholder="0"
          className="w-24 h-8 text-sm"
          value={discount || ''}
          onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {afterDiscount !== null ? formatCurrency(afterDiscount) : '—'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {afterAdd !== null ? formatCurrency(afterAdd) : '—'}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}
