'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { InvestorProfile, InvestorEntry } from '@/lib/database.types'
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
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Users,
} from 'lucide-react'
import { useUndo } from '@/lib/undo-context'

function today() {
  return new Date().toISOString().split('T')[0]
}

function calcStats(entries: InvestorEntry[], sharePrice: number) {
  const totalIn = entries.filter((e) => e.type === 'assets_in').reduce((s, e) => s + e.amount, 0)
  const totalOut = entries.filter((e) => e.type === 'assets_out').reduce((s, e) => s + e.amount, 0)
  const totalProfit = entries.filter((e) => e.type === 'profit').reduce((s, e) => s + e.amount, 0)
  const net = totalIn + totalProfit - totalOut
  const shares = sharePrice > 0 ? net / sharePrice : 0
  return { totalIn, totalOut, totalProfit, net, shares }
}

const TYPE_LABEL: Record<InvestorEntry['type'], string> = {
  assets_in: 'أصول داخل',
  assets_out: 'أصول خارج',
  profit: 'أرباح',
}
const TYPE_COLOR: Record<InvestorEntry['type'], string> = {
  assets_in: 'bg-blue-600 hover:bg-blue-700',
  assets_out: 'bg-red-600 hover:bg-red-700',
  profit: 'bg-green-600 hover:bg-green-700',
}
const TYPE_TEXT: Record<InvestorEntry['type'], string> = {
  assets_in: 'text-blue-600',
  assets_out: 'text-red-500',
  profit: 'text-green-600',
}

export function InvestorsClient() {
  const { push } = useUndo()
  const [investors, setInvestors] = useState<InvestorProfile[]>([])
  const [entries, setEntries] = useState<Record<string, InvestorEntry[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Inline editable fields per investor
  const [nameInput, setNameInput] = useState<Record<string, string>>({})
  const [sharePriceInput, setSharePriceInput] = useState<Record<string, string>>({})
  const [notesInput, setNotesInput] = useState<Record<string, string>>({})

  // Add investor dialog
  const [invDialog, setInvDialog] = useState(false)
  const [invForm, setInvForm] = useState({ name: '', share_price: '', notes: '' })

  // Add entry dialog
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; type: InvestorEntry['type'] }>({
    open: false,
    type: 'assets_in',
  })
  const [entryForm, setEntryForm] = useState({ amount: '', statement: '', date: today() })

  const loadAll = useCallback(async () => {
    const { data: invData } = await supabase
      .from('investor_profiles')
      .select('*')
      .order('created_at')
    if (invData) {
      setInvestors(invData)
      const nm: Record<string, string> = {}
      const sp: Record<string, string> = {}
      const nt: Record<string, string> = {}
      invData.forEach((inv) => {
        nm[inv.id] = inv.name
        sp[inv.id] = String(inv.share_price)
        nt[inv.id] = inv.notes ?? ''
      })
      setNameInput(nm)
      setSharePriceInput(sp)
      setNotesInput(nt)
    }
    const { data: entryData } = await supabase
      .from('investor_entries')
      .select('*')
      .order('date', { ascending: true })
    if (entryData) {
      const grouped: Record<string, InvestorEntry[]> = {}
      entryData.forEach((e) => {
        if (!grouped[e.investor_id]) grouped[e.investor_id] = []
        grouped[e.investor_id].push(e)
      })
      setEntries(grouped)
    }
  }, [])

  useEffect(() => {
    loadAll()
    window.addEventListener('delta:refresh', loadAll as EventListener)
    return () => window.removeEventListener('delta:refresh', loadAll as EventListener)
  }, [loadAll])

  const selectedInvestor = investors.find((i) => i.id === selectedId) ?? null
  const selectedEntries = selectedId ? (entries[selectedId] ?? []) : []

  // Total net across all investors
  const totalNetAll = investors.reduce((sum, inv) => {
    const { net } = calcStats(entries[inv.id] ?? [], inv.share_price)
    return sum + net
  }, 0)
  const totalInAll = investors.reduce((sum, inv) => {
    const { totalIn } = calcStats(entries[inv.id] ?? [], inv.share_price)
    return sum + totalIn
  }, 0)
  const totalOutAll = investors.reduce((sum, inv) => {
    const { totalOut } = calcStats(entries[inv.id] ?? [], inv.share_price)
    return sum + totalOut
  }, 0)
  const totalProfitAll = investors.reduce((sum, inv) => {
    const { totalProfit } = calcStats(entries[inv.id] ?? [], inv.share_price)
    return sum + totalProfit
  }, 0)

  // ---- Save functions (on blur / Enter) ----
  async function saveName(id: string) {
    const val = (nameInput[id] ?? '').trim()
    if (!val) { toast.error('الاسم لا يمكن أن يكون فارغاً'); return }
    const { error } = await supabase.from('investor_profiles').update({ name: val }).eq('id', id)
    if (error) { toast.error('فشل الحفظ'); return }
    setInvestors((prev) => prev.map((i) => i.id === id ? { ...i, name: val } : i))
  }

  async function saveSharePrice(id: string) {
    const val = parseFloat(sharePriceInput[id])
    if (isNaN(val) || val <= 0) { toast.error('سعر غير صالح'); return }
    const { error } = await supabase.from('investor_profiles').update({ share_price: val }).eq('id', id)
    if (error) { toast.error('فشل الحفظ'); return }
    setInvestors((prev) => prev.map((i) => i.id === id ? { ...i, share_price: val } : i))
  }

  async function saveNotes(id: string) {
    const val = notesInput[id] ?? ''
    await supabase.from('investor_profiles').update({ notes: val || null }).eq('id', id)
    setInvestors((prev) => prev.map((i) => i.id === id ? { ...i, notes: val || null } : i))
  }

  async function addInvestor() {
    if (!invForm.name) return
    const { data, error } = await supabase
      .from('investor_profiles')
      .insert({
        name: invForm.name,
        share_price: parseFloat(invForm.share_price) || 1,
        notes: invForm.notes || null,
      })
      .select()
      .single()
    if (error) { toast.error('فشل الإضافة'); return }
    setInvestors((prev) => [...prev, data])
    setNameInput((prev) => ({ ...prev, [data.id]: data.name }))
    setSharePriceInput((prev) => ({ ...prev, [data.id]: String(data.share_price) }))
    setNotesInput((prev) => ({ ...prev, [data.id]: data.notes ?? '' }))
    setInvDialog(false)
    setInvForm({ name: '', share_price: '', notes: '' })
    setSelectedId(data.id)
    toast.success('تم إضافة المستثمر')
    push({ label: `إضافة مستثمر: ${data.name}`, undo: async () => { await supabase.from('investor_profiles').delete().eq('id', data.id) } })
  }

  async function deleteInvestor(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المستثمر وجميع بياناته؟')) return
    const deleted = investors.find(i => i.id === id)
    await supabase.from('investor_profiles').delete().eq('id', id)
    setInvestors((prev) => prev.filter((i) => i.id !== id))
    setEntries((prev) => { const n = { ...prev }; delete n[id]; return n })
    if (selectedId === id) setSelectedId(null)
    toast.success('تم الحذف')
    if (deleted) push({ label: `حذف مستثمر: ${deleted.name}`, undo: async () => { await supabase.from('investor_profiles').insert({ name: deleted.name, share_price: deleted.share_price, notes: deleted.notes }) } })
  }

  async function addEntry() {
    if (!selectedId) return
    const { data, error } = await supabase
      .from('investor_entries')
      .insert({
        investor_id: selectedId,
        type: entryDialog.type,
        amount: parseFloat(entryForm.amount) || 0,
        statement: entryForm.statement || null,
        date: entryForm.date,
      })
      .select()
      .single()
    if (error) { toast.error('فشل الإضافة'); return }
    setEntries((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), data],
    }))
    setEntryDialog((prev) => ({ ...prev, open: false }))
    setEntryForm({ amount: '', statement: '', date: today() })
    toast.success('تم الإضافة')
    push({ label: `إضافة قيد للمستثمر`, undo: async () => { await supabase.from('investor_entries').delete().eq('id', data.id) } })
  }

  async function deleteEntry(entryId: string, investorId: string) {
    const deleted = (entries[investorId] ?? []).find(e => e.id === entryId)
    await supabase.from('investor_entries').delete().eq('id', entryId)
    setEntries((prev) => ({
      ...prev,
      [investorId]: (prev[investorId] ?? []).filter((e) => e.id !== entryId),
    }))
    if (deleted) push({ label: `حذف قيد`, undo: async () => { await supabase.from('investor_entries').insert({ investor_id: deleted.investor_id, type: deleted.type, amount: deleted.amount, statement: deleted.statement, date: deleted.date }) } })
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
          <Button size="sm" onClick={() => setInvDialog(true)}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة مستثمر
          </Button>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">المستثمرون</h1>
          <p className="text-xs text-muted-foreground">عدد الأسهم = (أصول داخل + أرباح − أصول خارج) ÷ سعر السهم</p>
        </div>
      </div>

      {/* Summary Cards */}
      {investors.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-primary text-primary-foreground rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <CircleDollarSign className="w-3.5 h-3.5 opacity-80" />
              <span className="text-xs opacity-80">إجمالي الصافي</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalNetAll)}</p>
            <p className="text-xs opacity-60 mt-0.5">{investors.length} مستثمر</p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">إجمالي الأصول الداخلة</span>
            </div>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(totalInAll)}</p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">إجمالي الأصول الخارجة</span>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(totalOutAll)}</p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">إجمالي الأرباح</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalProfitAll)}</p>
          </div>
        </div>
      )}

      {/* Investors Table — all cells inline-editable */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right py-2">المستثمر</TableHead>
              <TableHead className="text-right py-2">أصول داخل</TableHead>
              <TableHead className="text-right py-2">أصول خارج</TableHead>
              <TableHead className="text-right py-2">الأرباح</TableHead>
              <TableHead className="text-right py-2">الصافي</TableHead>
              <TableHead className="text-right py-2">سعر السهم</TableHead>
              <TableHead className="text-right py-2 font-bold">عدد الأسهم</TableHead>
              <TableHead className="text-right py-2">ملاحظات</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {investors.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8 text-sm">
                  لا يوجد مستثمرون — اضغط «إضافة مستثمر» للبدء
                </TableCell>
              </TableRow>
            )}
            {investors.map((inv) => {
              const invEntries = entries[inv.id] ?? []
              const { totalIn, totalOut, totalProfit, net, shares } = calcStats(invEntries, inv.share_price)
              const isSelected = selectedId === inv.id
              return (
                <TableRow
                  key={inv.id}
                  className={`transition-colors ${isSelected ? 'bg-primary/5 border-r-4 border-r-primary' : 'hover:bg-muted/20'}`}
                >
                  {/* Name — inline editable */}
                  <TableCell className="py-1" onClick={() => setSelectedId(isSelected ? null : inv.id)}>
                    <div className="flex items-center gap-1.5 cursor-pointer">
                      {isSelected
                        ? <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <Input
                        value={nameInput[inv.id] ?? inv.name}
                        onChange={(e) => setNameInput((p) => ({ ...p, [inv.id]: e.target.value }))}
                        onBlur={() => saveName(inv.id)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 text-sm font-semibold border-transparent hover:border-input focus:border-input min-w-[100px]"
                      />
                    </div>
                  </TableCell>

                  <TableCell className="text-blue-600 font-medium py-1 text-sm">{formatCurrency(totalIn)}</TableCell>
                  <TableCell className="text-red-500 font-medium py-1 text-sm">{formatCurrency(totalOut)}</TableCell>
                  <TableCell className="text-green-600 font-medium py-1 text-sm">{formatCurrency(totalProfit)}</TableCell>
                  <TableCell className="font-semibold py-1 text-sm">{formatCurrency(net)}</TableCell>

                  {/* Share price — inline editable */}
                  <TableCell className="py-1">
                    <Input
                      type="number"
                      value={sharePriceInput[inv.id] ?? inv.share_price}
                      onChange={(e) => setSharePriceInput((p) => ({ ...p, [inv.id]: e.target.value }))}
                      onBlur={() => saveSharePrice(inv.id)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                      className="h-7 w-24 text-sm border-transparent hover:border-input focus:border-input"
                    />
                  </TableCell>

                  <TableCell className="font-bold text-primary py-1">
                    {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </TableCell>

                  {/* Notes — inline editable */}
                  <TableCell className="py-1">
                    <Input
                      value={notesInput[inv.id] ?? ''}
                      onChange={(e) => setNotesInput((p) => ({ ...p, [inv.id]: e.target.value }))}
                      onBlur={() => saveNotes(inv.id)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                      className="h-7 text-sm border-transparent hover:border-input focus:border-input min-w-[120px]"
                      placeholder="ملاحظات..."
                    />
                  </TableCell>

                  <TableCell className="py-1">
                    <button onClick={() => deleteInvestor(inv.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Selected Investor Detail */}
      {selectedInvestor && (
        <div className="space-y-3">
          {/* 3 sections */}
          <div className="grid grid-cols-3 gap-3">
            {(['assets_in', 'assets_out', 'profit'] as const).map((type) => {
              const typeEntries = selectedEntries.filter((e) => e.type === type)
              const total = typeEntries.reduce((s, e) => s + e.amount, 0)
              return (
                <div key={type} className="bg-white border rounded-xl overflow-hidden">
                  <div className="p-3 border-b flex items-center justify-between">
                    <button
                      onClick={() => {
                        setEntryDialog({ open: true, type })
                        setEntryForm({ amount: '', statement: '', date: today() })
                      }}
                      className={`flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${TYPE_COLOR[type]}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة
                    </button>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{TYPE_LABEL[type]} — {selectedInvestor.name}</p>
                      <p className={`text-xs font-medium ${TYPE_TEXT[type]}`}>{formatCurrency(total)}</p>
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
                      {typeEntries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                            لا يوجد بيانات
                          </TableCell>
                        </TableRow>
                      )}
                      {typeEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="py-1 text-xs">{entry.statement || '—'}</TableCell>
                          <TableCell className={`py-1 text-xs font-medium ${TYPE_TEXT[type]}`}>
                            {formatCurrency(entry.amount)}
                          </TableCell>
                          <TableCell className="py-1 text-xs text-muted-foreground">{entry.date}</TableCell>
                          <TableCell className="py-1">
                            <button onClick={() => deleteEntry(entry.id, selectedInvestor.id)}>
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {typeEntries.length > 0 && (
                        <TableRow className="bg-muted/20 font-semibold text-xs">
                          <TableCell className="py-1">الإجمالي</TableCell>
                          <TableCell className={`py-1 ${TYPE_TEXT[type]}`}>{formatCurrency(total)}</TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )
            })}
          </div>

          {/* Formula */}
          {(() => {
            const { totalIn, totalOut, totalProfit, net, shares } = calcStats(selectedEntries, selectedInvestor.share_price)
            return (
              <div className="bg-white border rounded-xl p-4">
                <p className="text-sm font-semibold text-right mb-3">
                  معادلة حساب الأسهم — {selectedInvestor.name}
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <div className="bg-primary text-primary-foreground rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs opacity-80 mb-0.5">عدد الأسهم</p>
                    <p className="text-xl font-bold">{shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
                  </div>
                  <span className="text-xl text-muted-foreground">=</span>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs text-blue-600 mb-0.5">أصول داخل</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(totalIn)}</p>
                  </div>
                  <span className="text-xl text-muted-foreground">+</span>
                  <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs text-green-600 mb-0.5">أرباح</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(totalProfit)}</p>
                  </div>
                  <span className="text-xl text-muted-foreground">−</span>
                  <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs text-red-500 mb-0.5">أصول خارج</p>
                    <p className="text-lg font-bold text-red-500">{formatCurrency(totalOut)}</p>
                  </div>
                  <span className="text-xl text-muted-foreground">÷</span>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs text-amber-600 mb-0.5">سعر السهم</p>
                    <p className="text-lg font-bold text-amber-600">{formatCurrency(selectedInvestor.share_price)}</p>
                  </div>
                  <span className="text-xl text-muted-foreground">=</span>
                  <div className="bg-muted rounded-xl px-5 py-3 text-center min-w-[110px]">
                    <p className="text-xs text-muted-foreground mb-0.5">الصافي</p>
                    <p className="text-lg font-bold">{formatCurrency(net)}</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Add Investor Dialog */}
      <Dialog open={invDialog} onOpenChange={setInvDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستثمر جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addInvestor() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم المستثمر *</label>
              <Input
                value={invForm.name}
                onChange={(e) => setInvForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="الاسم"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">سعر السهم (ج.م)</label>
              <Input
                type="number"
                value={invForm.share_price}
                onChange={(e) => setInvForm((f) => ({ ...f, share_price: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Input
                value={invForm.notes}
                onChange={(e) => setInvForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setInvDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={!invForm.name}>إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog
        open={entryDialog.open}
        onOpenChange={(open) => setEntryDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة — {TYPE_LABEL[entryDialog.type]}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addEntry() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ج.م)</label>
              <Input
                type="number"
                value={entryForm.amount}
                onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">البيان</label>
              <Input
                value={entryForm.statement}
                onChange={(e) => setEntryForm((f) => ({ ...f, statement: e.target.value }))}
                placeholder="البيان..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input
                type="date"
                value={entryForm.date}
                onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setEntryDialog((prev) => ({ ...prev, open: false }))}>
                إلغاء
              </Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
