'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Category, Debt, Creditor } from '@/lib/database.types'
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
import { Plus, Trash2, Save, RefreshCw, TrendingDown, Package, Landmark, TrendingUp, CircleDollarSign, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useUndo } from '@/lib/undo-context'

function today() {
  return new Date().toISOString().split('T')[0]
}

export function BalanceClient() {
  const { push } = useUndo()
  const [bankTotal, setBankTotal] = useState(0)
  const [unifiedPrice, setUnifiedPrice] = useState(50)
  const [priceInput, setPriceInput] = useState('50')
  const [categories, setCategories] = useState<Category[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [creditors, setCreditors] = useState<Creditor[]>([])
  const [clientNames, setClientNames] = useState<Set<string>>(new Set())

  // Dialog states
  const [catDialog, setCatDialog] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', pieces_count: '' })

  const [debtDialog, setDebtDialog] = useState(false)
  const [debtForm, setDebtForm] = useState({ debtor_name: '', amount: '', date: today() })

  const [credDialog, setCredDialog] = useState(false)
  const [credForm, setCredForm] = useState({ creditor_name: '', amount: '', date: today() })

  const [investorsPageNet, setInvestorsPageNet] = useState(0)
  const [managerPageNet, setManagerPageNet] = useState(0)
  const [managerInvestBalance, setManagerInvestBalance] = useState(0)
  const [managerCurrentInvest, setManagerCurrentInvest] = useState(0)
  const [managerInvestStart, setManagerInvestStart] = useState(0)

  const loadAll = useCallback(async () => {
    const [bankRes, catRes, debtRes, credRes, settRes, entriesRes, mgrSettRes, mgrTxRes, clientRes] = await Promise.all([
      supabase.from('bank_accounts').select('balance'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('debts').select('*').order('created_at'),
      supabase.from('creditors').select('*').order('created_at'),
      supabase.from('settings').select('*').eq('key', 'unified_price').single(),
      supabase.from('investor_entries').select('type, amount'),
      supabase.from('manager_settings').select('key, value'),
      supabase.from('manager_transactions').select('type, amount'),
      supabase.from('client_profiles').select('name'),
    ])
    if (bankRes.data) setBankTotal(bankRes.data.reduce((s, r) => s + (r.balance ?? 0), 0))
    if (catRes.data) setCategories(catRes.data)
    if (debtRes.data) setDebts(debtRes.data)
    if (credRes.data) setCreditors(credRes.data)
    if (settRes.data) {
      const p = parseFloat(settRes.data.value) || 50
      setUnifiedPrice(p)
      setPriceInput(String(p))
    }
    if (entriesRes.data) {
      const entries = entriesRes.data as { type: string; amount: number }[]
      const eIn = entries.filter(e => e.type === 'assets_in').reduce((s, e) => s + e.amount, 0)
      const eOut = entries.filter(e => e.type === 'assets_out').reduce((s, e) => s + e.amount, 0)
      const eProfit = entries.filter(e => e.type === 'profit').reduce((s, e) => s + e.amount, 0)
      setInvestorsPageNet(eIn + eProfit - eOut)
    }
    if (clientRes.data) setClientNames(new Set(clientRes.data.map((r: { name: string }) => r.name)))
    if (mgrSettRes.data && mgrTxRes.data) {
      const sett = mgrSettRes.data as { key: string; value: number }[]
      const principal = Number(sett.find(s => s.key === 'principal')?.value ?? 0)
      const investStart = Number(sett.find(s => s.key === 'invest_start')?.value ?? 0)
      const tx = mgrTxRes.data as { type: string; amount: number }[]
      const mIn = tx.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0)
      const mOut = tx.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0)
      setManagerPageNet(principal + investStart + mIn - mOut)
      setManagerInvestBalance(mOut - mIn)
      setManagerCurrentInvest(investStart - (mOut - mIn))
      setManagerInvestStart(investStart)
    }
  }, [])

  useEffect(() => {
    loadAll()
    window.addEventListener('delta:refresh', loadAll as EventListener)
    return () => window.removeEventListener('delta:refresh', loadAll as EventListener)
  }, [loadAll])

  const totalPieces = categories.reduce((s, c) => s + c.pieces_count, 0)
  const inventoryValue = totalPieces * unifiedPrice
  const totalDebts = debts.reduce((s, d) => s + d.amount, 0)
  const totalCreditors = creditors.reduce((s, c) => s + c.amount, 0)
  const netBalance = bankTotal + inventoryValue + totalCreditors - totalDebts

  const In1 = bankTotal + totalCreditors + inventoryValue
  const Out1 = investorsPageNet + totalDebts
  const currentInvestmentBalance = In1 - Out1
  const profit = currentInvestmentBalance - managerInvestStart + managerInvestBalance

  // ---- Unified Price ----
  async function savePrice() {
    const val = parseFloat(priceInput)
    if (isNaN(val) || val <= 0) { toast.error('سعر غير صالح'); return }
    const { error } = await supabase.from('settings').upsert({ key: 'unified_price', value: String(val) }, { onConflict: 'key' })
    if (error) toast.error('فشل حفظ السعر')
    else { setUnifiedPrice(val); toast.success('تم حفظ السعر') }
  }

  // ---- Categories ----
  async function addCategory() {
    if (!catForm.name) return
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: catForm.name, pieces_count: parseFloat(catForm.pieces_count) || 0 })
      .select().single()
    if (error) toast.error(`فشل الإضافة: ${error.message}`)
    else {
      setCategories(c => [...c, data])
      push({ label: `إضافة صنف: ${data.name}`, undo: async () => { await supabase.from('categories').delete().eq('id', data.id) } })
      setCatDialog(false)
      setCatForm({ name: '', pieces_count: '' })
    }
  }

  async function updateCategory(id: string, field: keyof Category, value: string | number) {
    const update = { [field]: value }
    await supabase.from('categories').update(update).eq('id', id)
    setCategories(cats => cats.map(c => c.id === id ? { ...c, ...update } : c))
  }

  async function deleteCategory(id: string) {
    const deleted = categories.find(x => x.id === id)
    await supabase.from('categories').delete().eq('id', id)
    setCategories(c => c.filter(x => x.id !== id))
    if (deleted) push({ label: `حذف صنف: ${deleted.name}`, undo: async () => { await supabase.from('categories').insert({ name: deleted.name, pieces_count: deleted.pieces_count }) } })
  }

  // ---- Debts ----
  async function addDebt() {
    if (!debtForm.debtor_name) return
    const { data, error } = await supabase
      .from('debts')
      .insert({ debtor_name: debtForm.debtor_name, amount: parseFloat(debtForm.amount) || 0, date: debtForm.date })
      .select().single()
    if (error) toast.error(`فشل الإضافة: ${error.message}`)
    else {
      setDebts(d => [...d, data])
      push({ label: `إضافة علينا: ${data.debtor_name}`, undo: async () => { await supabase.from('debts').delete().eq('id', data.id) } })
      setDebtDialog(false)
      setDebtForm({ debtor_name: '', amount: '', date: today() })
    }
  }

  async function updateDebt(id: string, field: string, value: string | number) {
    const update = { [field]: value }
    await supabase.from('debts').update(update).eq('id', id)
    setDebts(d => d.map(x => x.id === id ? { ...x, ...update } : x))
  }

  async function deleteDebt(id: string) {
    const deleted = debts.find(x => x.id === id)
    await supabase.from('debts').delete().eq('id', id)
    setDebts(d => d.filter(x => x.id !== id))
    if (deleted) push({ label: `حذف علينا: ${deleted.debtor_name}`, undo: async () => { await supabase.from('debts').insert({ debtor_name: deleted.debtor_name, amount: deleted.amount, date: deleted.date }) } })
  }

  // ---- Creditors ----
  async function addCreditor() {
    if (!credForm.creditor_name) return
    const { data, error } = await supabase
      .from('creditors')
      .insert({ creditor_name: credForm.creditor_name, amount: parseFloat(credForm.amount) || 0, date: credForm.date })
      .select().single()
    if (error) toast.error(`فشل الإضافة: ${error.message}`)
    else {
      setCreditors(d => [...d, data])
      push({ label: `إضافة لينا: ${data.creditor_name}`, undo: async () => { await supabase.from('creditors').delete().eq('id', data.id) } })
      setCredDialog(false)
      setCredForm({ creditor_name: '', amount: '', date: today() })
    }
  }

  async function updateCreditor(id: string, field: string, value: string | number) {
    const update = { [field]: value }
    await supabase.from('creditors').update(update).eq('id', id)
    setCreditors(d => d.map(x => x.id === id ? { ...x, ...update } : x))
  }

  async function deleteCreditor(id: string) {
    const deleted = creditors.find(x => x.id === id)
    await supabase.from('creditors').delete().eq('id', id)
    setCreditors(d => d.filter(x => x.id !== id))
    if (deleted) push({ label: `حذف لينا: ${deleted.creditor_name}`, undo: async () => { await supabase.from('creditors').insert({ creditor_name: deleted.creditor_name, amount: deleted.amount, date: deleted.date }) } })
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw className="w-4 h-4 ml-1" />
          تحديث
        </Button>
        <div className="text-right">
          <h1 className="text-xl font-bold">حساب الرصيد</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            صافي الرصيد = أرصدة بنكية + قيمة البضاعة + لينا − علينا
          </p>
        </div>
      </div>

      {/* Profit + all summary in one compact block */}
      <div className="grid grid-cols-5 gap-2">
        {/* Profit */}
        <div className="col-span-2 rounded-lg px-4 py-3 flex flex-col justify-between bg-red-800">
          <div className="flex items-center gap-1.5">
            <CircleDollarSign className="w-4 h-4 text-white/70" />
            <span className="text-sm font-medium text-white/80">الأرباح</span>
          </div>
          <p className="text-3xl font-bold text-yellow-400">{formatCurrency(Math.abs(profit))}</p>
          <p className="text-xs text-white/60 leading-tight">رصيد الاستثمار − بداية الاستثمار + سحب المدير</p>
        </div>
        {/* المستثمرون */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2 py-2 text-right">
          <p className="text-xs text-blue-500 leading-tight">صافي المستثمرين</p>
          <p className="text-sm font-bold text-blue-600">{formatCurrency(investorsPageNet)}</p>
        </div>
        {/* المال العام */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-2 py-2 text-right">
          <p className="text-xs text-primary/70 leading-tight">مال المدير</p>
          <p className="text-sm font-bold text-primary">{formatCurrency(managerPageNet)}</p>
        </div>
        {/* البنوك */}
        <div className="bg-primary text-primary-foreground rounded-lg px-2 py-2 text-right">
          <div className="flex items-center justify-end gap-1 mb-0.5">
            <span className="text-xs opacity-80">البنوك</span>
            <Landmark className="w-3 h-3 opacity-80" />
          </div>
          <p className="text-sm font-bold">{formatCurrency(bankTotal)}</p>
        </div>
      </div>

      {/* Second row of summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border rounded-lg px-3 py-2 flex items-center justify-between">
          <p className="text-sm font-bold">{formatCurrency(inventoryValue)}</p>
          <div className="flex items-center gap-1 text-right">
            <div>
              <p className="text-xs text-muted-foreground">قيمة البضاعة</p>
              <p className="text-xs text-muted-foreground">{totalPieces} قطعة × {unifiedPrice}</p>
            </div>
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-white border rounded-lg px-3 py-2 flex items-center justify-between">
          <p className="text-sm font-bold text-red-500">{formatCurrency(totalDebts)}</p>
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground">إجمالي علينا</p>
            <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-white border rounded-lg px-3 py-2 flex items-center justify-between">
          <p className="text-sm font-bold text-blue-600">{formatCurrency(totalCreditors)}</p>
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground">إجمالي لينا</p>
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Unified Price */}
      <div className="bg-white border rounded-lg">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Input type="number" value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
              className="w-28 h-7 text-sm" onKeyDown={(e) => e.key === 'Enter' && savePrice()} />
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={savePrice}>
              <Save className="w-3.5 h-3.5 ml-1" />حفظ
            </Button>
          </div>
          <span className="text-sm font-semibold">السعر الموحد للقطعة</span>
        </div>
      </div>

      {/* Categories */}
      <SectionCard title="الأصناف" subtitle={`${totalPieces} قطعة`}
        addLabel="إضافة صنف" addColor="bg-blue-600 hover:bg-blue-700" onAdd={() => setCatDialog(true)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-right w-8 py-1">#</TableHead>
              <TableHead className="text-right py-1">اسم الصنف</TableHead>
              <TableHead className="text-right py-1">عدد القطع</TableHead>
              <TableHead className="text-right py-1">القيمة</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">لا يوجد أصناف</TableCell></TableRow>
            )}
            {categories.map((cat, i) => (
              <TableRow key={cat.id}>
                <TableCell className="text-muted-foreground text-xs py-1">{i + 1}</TableCell>
                <TableCell className="py-1">
                  <Input value={cat.name} onChange={(e) => updateCategory(cat.id, 'name', e.target.value)}
                    className="h-7 text-sm border-transparent hover:border-input focus:border-input" />
                </TableCell>
                <TableCell className="py-1">
                  <Input type="number" value={cat.pieces_count}
                    onChange={(e) => updateCategory(cat.id, 'pieces_count', parseFloat(e.target.value) || 0)}
                    className="h-7 w-24 text-sm border-transparent hover:border-input focus:border-input" />
                </TableCell>
                <TableCell className="font-medium text-sm py-1">{formatCurrency(cat.pieces_count * unifiedPrice)}</TableCell>
                <TableCell className="py-1">
                  <button onClick={() => deleteCategory(cat.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20 font-semibold text-sm">
              <TableCell /><TableCell className="text-right py-1">الإجمالي</TableCell>
              <TableCell className="py-1">{totalPieces} قطعة</TableCell>
              <TableCell className="py-1">{formatCurrency(inventoryValue)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      {/* علينا + لينا side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* علينا */}
        <SectionCard title="علينا" subtitle={`الإجمالي: ${formatCurrency(totalDebts)}`}
          addLabel="إضافة" addColor="bg-red-600 hover:bg-red-700" onAdd={() => setDebtDialog(true)}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right w-8 py-1">#</TableHead>
                <TableHead className="text-right py-1">الاسم</TableHead>
                <TableHead className="text-right py-1">المبلغ</TableHead>
                <TableHead className="text-right py-1">التاريخ</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">لا يوجد بيانات</TableCell></TableRow>
              )}
              {debts.map((debt, i) => {
                const locked = clientNames.has(debt.debtor_name)
                return (
                  <TableRow key={debt.id} className={locked ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}>
                    <TableCell className="text-muted-foreground text-xs py-1">{i + 1}</TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <div className="flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-orange-500 shrink-0" />
                          <span className="text-sm font-medium">{debt.debtor_name}</span>
                        </div>
                      ) : (
                        <Input value={debt.debtor_name} onChange={(e) => updateDebt(debt.id, 'debtor_name', e.target.value)}
                          className="h-7 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="text-sm">{debt.amount.toLocaleString()}</span>
                      ) : (
                        <Input type="number" value={debt.amount}
                          onChange={(e) => updateDebt(debt.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="h-7 w-24 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="text-xs text-muted-foreground">{debt.date}</span>
                      ) : (
                        <Input type="date" value={debt.date} onChange={(e) => updateDebt(debt.id, 'date', e.target.value)}
                          className="h-7 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {!locked && (
                        <button onClick={() => deleteDebt(debt.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/20 font-semibold text-sm">
                <TableCell colSpan={2} className="text-right py-1">الإجمالي</TableCell>
                <TableCell className="text-red-500 py-1">{formatCurrency(totalDebts)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </SectionCard>

        {/* لينا */}
        <SectionCard title="لينا" subtitle={`الإجمالي: ${formatCurrency(totalCreditors)}`}
          addLabel="إضافة" addColor="bg-blue-600 hover:bg-blue-700" onAdd={() => setCredDialog(true)}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right w-8 py-1">#</TableHead>
                <TableHead className="text-right py-1">الاسم</TableHead>
                <TableHead className="text-right py-1">المبلغ</TableHead>
                <TableHead className="text-right py-1">التاريخ</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditors.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">لا يوجد بيانات</TableCell></TableRow>
              )}
              {creditors.map((cred, i) => {
                const locked = clientNames.has(cred.creditor_name)
                return (
                  <TableRow key={cred.id} className={locked ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}>
                    <TableCell className="text-muted-foreground text-xs py-1">{i + 1}</TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <div className="flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-orange-500 shrink-0" />
                          <span className="text-sm font-medium">{cred.creditor_name}</span>
                        </div>
                      ) : (
                        <Input value={cred.creditor_name} onChange={(e) => updateCreditor(cred.id, 'creditor_name', e.target.value)}
                          className="h-7 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="text-sm">{cred.amount.toLocaleString()}</span>
                      ) : (
                        <Input type="number" value={cred.amount}
                          onChange={(e) => updateCreditor(cred.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="h-7 w-24 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {locked ? (
                        <span className="text-xs text-muted-foreground">{cred.date}</span>
                      ) : (
                        <Input type="date" value={cred.date} onChange={(e) => updateCreditor(cred.id, 'date', e.target.value)}
                          className="h-7 text-sm border-transparent hover:border-input focus:border-input" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      {!locked && (
                        <button onClick={() => deleteCreditor(cred.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/20 font-semibold text-sm">
                <TableCell colSpan={2} className="text-right py-1">الإجمالي</TableCell>
                <TableCell className="text-blue-600 py-1">{formatCurrency(totalCreditors)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </SectionCard>
      </div>


      {/* Final Equation */}
      <CollapsibleSection title="المعادلة النهائية">
        <div className="p-5 flex items-center justify-center gap-3 flex-wrap">
          <div className="bg-green-600 text-white rounded-xl px-6 py-4 text-center min-w-[150px]">
            <p className="text-xs opacity-80 mb-1">صافي الرصيد</p>
            <p className="text-xl font-bold">{formatCurrency(netBalance)}</p>
          </div>
          <span className="text-2xl font-light text-muted-foreground">=</span>
          <div className="bg-primary text-primary-foreground rounded-xl px-6 py-4 text-center min-w-[150px]">
            <p className="text-xs opacity-80 mb-1">إجمالي الأرصدة</p>
            <p className="text-xl font-bold">{formatCurrency(bankTotal)}</p>
          </div>
          <span className="text-2xl font-light text-muted-foreground">+</span>
          <div className="bg-amber-500 text-white rounded-xl px-6 py-4 text-center min-w-[150px]">
            <p className="text-xs opacity-80 mb-1">قيمة البضاعة</p>
            <p className="text-xl font-bold">{formatCurrency(inventoryValue)}</p>
          </div>
          <span className="text-2xl font-light text-muted-foreground">+</span>
          <div className="bg-blue-500 text-white rounded-xl px-6 py-4 text-center min-w-[150px]">
            <p className="text-xs opacity-80 mb-1">لينا</p>
            <p className="text-xl font-bold">{formatCurrency(totalCreditors)}</p>
          </div>
          <span className="text-2xl font-light text-muted-foreground">−</span>
          <div className="bg-red-500 text-white rounded-xl px-6 py-4 text-center min-w-[150px]">
            <p className="text-xs opacity-80 mb-1">علينا</p>
            <p className="text-xl font-bold">{formatCurrency(totalDebts)}</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* ---- Dialogs ---- */}

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة صنف جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addCategory() }} className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم الصنف *</label>
              <Input value={catForm.name} onChange={(e) => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الصنف" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">عدد القطع</label>
              <Input type="number" value={catForm.pieces_count} onChange={(e) => setCatForm(f => ({ ...f, pieces_count: e.target.value }))} placeholder="0" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setCatDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={!catForm.name}>إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Debt Dialog */}
      <Dialog open={debtDialog} onOpenChange={setDebtDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة — علينا</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addDebt() }} className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">الاسم *</label>
              <Input value={debtForm.debtor_name} onChange={(e) => setDebtForm(f => ({ ...f, debtor_name: e.target.value }))} placeholder="الاسم" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ج.م)</label>
              <Input type="number" value={debtForm.amount} onChange={(e) => setDebtForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input type="date" value={debtForm.date} onChange={(e) => setDebtForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDebtDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={!debtForm.debtor_name}>إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Creditor Dialog */}
      <Dialog open={credDialog} onOpenChange={setCredDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة — لينا</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addCreditor() }} className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">الاسم *</label>
              <Input value={credForm.creditor_name} onChange={(e) => setCredForm(f => ({ ...f, creditor_name: e.target.value }))} placeholder="الاسم" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ج.م)</label>
              <Input type="number" value={credForm.amount} onChange={(e) => setCredForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input type="date" value={credForm.date} onChange={(e) => setCredForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setCredDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={!credForm.creditor_name}>إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface SectionCardProps {
  title: string
  subtitle: string
  addLabel: string
  addColor: string
  onAdd: () => void
  children: React.ReactNode
}

function SectionCard({ title, subtitle, addLabel, addColor, onAdd, children }: SectionCardProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className={`flex items-center gap-1.5 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${addColor}`}
          >
            <Plus className="w-4 h-4" />
            {addLabel}
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {open && children}
    </div>
  )
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {open && children}
    </div>
  )
}
