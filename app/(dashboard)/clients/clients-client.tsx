'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { useUndo } from '@/lib/undo-context'

interface ClientProfile {
  id: string
  name: string
  notes: string | null
  created_at: string
}

interface ClientTransaction {
  id: string
  client_id: string
  type: 'in' | 'out'
  amount: number
  statement: string | null
  date: string
  created_at: string
}

function today() {
  return new Date().toISOString().split('T')[0]
}

async function syncBalances(
  allClients: ClientProfile[],
  allTransactions: Record<string, ClientTransaction[]>,
) {
  if (allClients.length === 0) return
  const names = allClients.map(c => c.name)
  await Promise.all([
    ...names.map(n => supabase.from('debts').delete().eq('debtor_name', n)),
    ...names.map(n => supabase.from('creditors').delete().eq('creditor_name', n)),
  ])

  const d = today()
  const inserts: PromiseLike<any>[] = []
  allClients.forEach((client) => {
    const txList = allTransactions[client.id] ?? []
    const totalIn = txList.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0)
    const totalOut = txList.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0)
    const net = totalIn - totalOut
    if (net > 0) {
      inserts.push(supabase.from('debts').insert({ debtor_name: client.name, amount: net, date: d }))
    } else if (net < 0) {
      inserts.push(supabase.from('creditors').insert({ creditor_name: client.name, amount: Math.abs(net), date: d }))
    }
  })
  await Promise.all(inserts)
}

export function ClientsClient() {
  const { push } = useUndo()
  const [clients, setClients] = useState<ClientProfile[]>([])
  const [transactions, setTransactions] = useState<Record<string, ClientTransaction[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Client name inline edit
  const [nameInput, setNameInput] = useState<Record<string, string>>({})

  // Add client dialog
  const [clientDialog, setClientDialog] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', notes: '' })

  // Add transaction dialog
  const [txDialog, setTxDialog] = useState<{ open: boolean; clientId: string | null; type: 'in' | 'out' }>({
    open: false, clientId: null, type: 'in',
  })
  const [txForm, setTxForm] = useState({ amount: '', statement: '', date: today() })

  const loadAll = useCallback(async () => {
    const { data: cData } = await supabase
      .from('client_profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (cData) {
      setClients(cData)
      const nm: Record<string, string> = {}
      cData.forEach((c: ClientProfile) => { nm[c.id] = c.name })
      setNameInput(nm)
    }

    const { data: tData } = await supabase
      .from('client_transactions')
      .select('*')
      .order('date', { ascending: true })
    if (tData) {
      const grouped: Record<string, ClientTransaction[]> = {}
      tData.forEach((t: ClientTransaction) => {
        if (!grouped[t.client_id]) grouped[t.client_id] = []
        grouped[t.client_id].push(t)
      })
      setTransactions(grouped)
    }
  }, [])

  useEffect(() => {
    loadAll()
    window.addEventListener('delta:refresh', loadAll as EventListener)
    return () => window.removeEventListener('delta:refresh', loadAll as EventListener)
  }, [loadAll])

  // Totals
  const grandTotalIn = clients.reduce((s, c) => {
    return s + (transactions[c.id] ?? []).filter(t => t.type === 'in').reduce((a, t) => a + t.amount, 0)
  }, 0)
  const grandTotalOut = clients.reduce((s, c) => {
    return s + (transactions[c.id] ?? []).filter(t => t.type === 'out').reduce((a, t) => a + t.amount, 0)
  }, 0)

  async function saveName(id: string) {
    const val = (nameInput[id] ?? '').trim()
    if (!val) { toast.error('الاسم لا يمكن أن يكون فارغاً'); return }
    await supabase.from('client_profiles').update({ name: val }).eq('id', id)
    const updatedClients = clients.map(c => c.id === id ? { ...c, name: val } : c)
    setClients(updatedClients)
    await syncBalances(updatedClients, transactions)
  }

  async function addClient() {
    if (!clientForm.name.trim()) return
    const { data, error } = await supabase
      .from('client_profiles')
      .insert({ name: clientForm.name.trim(), notes: clientForm.notes || null })
      .select().single()
    if (error) { toast.error('فشل الإضافة'); return }
    const updatedClients = [...clients, data]
    setClients(updatedClients)
    setNameInput(prev => ({ ...prev, [data.id]: data.name }))
    setClientDialog(false)
    setClientForm({ name: '', notes: '' })
    setExpandedId(data.id)
    toast.success('تم إضافة العميل')
    push({ label: `إضافة عميل: ${data.name}`, undo: async () => { await supabase.from('client_profiles').delete().eq('id', data.id) } })
    await syncBalances(updatedClients, transactions)
  }

  async function deleteClient(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا العميل وجميع معاملاته؟')) return
    const toDelete = clients.find(c => c.id === id)
    await supabase.from('client_profiles').delete().eq('id', id)
    const updatedClients = clients.filter(c => c.id !== id)
    const updatedTx = { ...transactions }
    delete updatedTx[id]
    setClients(updatedClients)
    setTransactions(updatedTx)
    if (expandedId === id) setExpandedId(null)
    toast.success('تم الحذف')
    if (toDelete) push({ label: `حذف عميل: ${toDelete.name}`, undo: async () => { await supabase.from('client_profiles').insert({ name: toDelete.name, notes: toDelete.notes }) } })
    await syncBalances(updatedClients, updatedTx)
  }

  async function addTransaction() {
    if (!txDialog.clientId) return
    const { data, error } = await supabase
      .from('client_transactions')
      .insert({
        client_id: txDialog.clientId,
        type: txDialog.type,
        amount: parseFloat(txForm.amount) || 0,
        statement: txForm.statement || null,
        date: txForm.date,
      })
      .select().single()
    if (error) { toast.error('فشل الإضافة'); return }
    const updatedTx = {
      ...transactions,
      [txDialog.clientId!]: [...(transactions[txDialog.clientId!] ?? []), data],
    }
    setTransactions(updatedTx)
    setTxDialog(p => ({ ...p, open: false }))
    setTxForm({ amount: '', statement: '', date: today() })
    toast.success('تم الإضافة')
    push({ label: `إضافة معاملة`, undo: async () => { await supabase.from('client_transactions').delete().eq('id', data.id) } })
    await syncBalances(clients, updatedTx)
  }

  async function deleteTransaction(id: string, clientId: string) {
    const toDelete = (transactions[clientId] ?? []).find(t => t.id === id)
    await supabase.from('client_transactions').delete().eq('id', id)
    const updatedTx = {
      ...transactions,
      [clientId]: (transactions[clientId] ?? []).filter(t => t.id !== id),
    }
    setTransactions(updatedTx)
    if (toDelete) push({ label: `حذف معاملة`, undo: async () => { await supabase.from('client_transactions').insert({ client_id: toDelete.client_id, type: toDelete.type, amount: toDelete.amount, statement: toDelete.statement, date: toDelete.date }) } })
    await syncBalances(clients, updatedTx)
  }

  function openTxDialog(clientId: string, type: 'in' | 'out') {
    setTxDialog({ open: true, clientId, type })
    setTxForm({ amount: '', statement: '', date: today() })
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
          <Button size="sm" onClick={() => setClientDialog(true)}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة عميل
          </Button>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">حسابات العملاء</h1>
          <p className="text-xs text-muted-foreground">{clients.length} عميل</p>
        </div>
      </div>

      {/* Grand totals */}
      {clients.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-right">
            <p className="text-xs text-blue-500">إجمالي داخل</p>
            <p className="text-base font-bold text-blue-600">{formatCurrency(grandTotalIn)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-right">
            <p className="text-xs text-red-500">إجمالي خارج</p>
            <p className="text-base font-bold text-red-500">{formatCurrency(grandTotalOut)}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 text-right border ${(grandTotalIn - grandTotalOut) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-xs ${(grandTotalIn - grandTotalOut) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>الإجمالي الكلي</p>
            <p className={`text-base font-bold ${(grandTotalIn - grandTotalOut) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(grandTotalIn - grandTotalOut)}</p>
          </div>
        </div>
      )}

      {/* Clients list */}
      {clients.length === 0 && (
        <div className="bg-white border rounded-xl p-8 text-center text-muted-foreground text-sm">
          لا يوجد عملاء — اضغط «إضافة عميل» للبدء
        </div>
      )}

      <div className="space-y-2">
        {clients.map((client) => {
          const txList = transactions[client.id] ?? []
          const totalIn = txList.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0)
          const totalOut = txList.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0)
          const net = totalIn - totalOut
          const isExpanded = expandedId === client.id

          return (
            <div key={client.id} className="bg-white border rounded-xl overflow-hidden">
              {/* Client header */}
              <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : client.id)}
              >
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); deleteClient(client.id) }} className="p-1 rounded hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                  </button>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-primary" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  <div className="flex gap-4 text-sm">
                    <span className="text-blue-600 font-medium">داخل: {formatCurrency(totalIn)}</span>
                    <span className="text-red-500 font-medium">خارج: {formatCurrency(totalOut)}</span>
                    <span className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      الإجمالي: {formatCurrency(net)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Input
                    value={nameInput[client.id] ?? client.name}
                    onChange={(e) => setNameInput(p => ({ ...p, [client.id]: e.target.value }))}
                    onBlur={() => saveName(client.id)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 text-sm font-semibold border-transparent hover:border-input focus:border-input text-right w-40"
                  />
                </div>
              </div>

              {/* Client transactions table */}
              {isExpanded && (
                <div className="border-t">
                  {/* Action buttons */}
                  <div className="px-3 py-2 flex gap-2 bg-muted/10 border-b">
                    <button
                      onClick={() => openTxDialog(client.id, 'in')}
                      className="flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      داخل
                    </button>
                    <button
                      onClick={() => openTxDialog(client.id, 'out')}
                      className="flex items-center gap-1 text-white text-xs px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      خارج
                    </button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-right py-1.5 text-xs">التاريخ</TableHead>
                        <TableHead className="text-right py-1.5 text-xs">البيان</TableHead>
                        <TableHead className="text-right py-1.5 text-xs text-blue-600">داخل</TableHead>
                        <TableHead className="text-right py-1.5 text-xs text-red-500">خارج</TableHead>
                        <TableHead className="text-right py-1.5 text-xs">الإجمالي</TableHead>
                        <TableHead className="w-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txList.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">لا يوجد معاملات</TableCell>
                        </TableRow>
                      )}
                      {txList.map((tx, idx) => {
                        const runningNet = txList.slice(0, idx + 1).reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0)
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="py-1 text-xs text-muted-foreground">{tx.date}</TableCell>
                            <TableCell className="py-1 text-xs">{tx.statement || '—'}</TableCell>
                            <TableCell className="py-1 text-xs font-medium text-blue-600">
                              {tx.type === 'in' ? formatCurrency(tx.amount) : '—'}
                            </TableCell>
                            <TableCell className="py-1 text-xs font-medium text-red-500">
                              {tx.type === 'out' ? formatCurrency(tx.amount) : '—'}
                            </TableCell>
                            <TableCell className={`py-1 text-xs font-semibold ${runningNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {formatCurrency(runningNet)}
                            </TableCell>
                            <TableCell className="py-1">
                              <button onClick={() => deleteTransaction(tx.id, client.id)}>
                                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                              </button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {txList.length > 0 && (
                        <TableRow className="bg-muted/20 font-semibold text-xs">
                          <TableCell colSpan={2} className="py-1 text-right">الإجمالي</TableCell>
                          <TableCell className="py-1 text-blue-600">{formatCurrency(totalIn)}</TableCell>
                          <TableCell className="py-1 text-red-500">{formatCurrency(totalOut)}</TableCell>
                          <TableCell className={`py-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(net)}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Client Dialog */}
      <Dialog open={clientDialog} onOpenChange={setClientDialog}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addClient() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم العميل *</label>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm(f => ({ ...f, name: e.target.value }))}
                placeholder="الاسم"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
              <Input
                value={clientForm.notes}
                onChange={(e) => setClientForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setClientDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={!clientForm.name.trim()}>إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Dialog */}
      <Dialog open={txDialog.open} onOpenChange={(open) => setTxDialog(p => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              إضافة — {txDialog.type === 'in' ? 'داخل' : 'خارج'}
              {txDialog.clientId && ` (${clients.find(c => c.id === txDialog.clientId)?.name ?? ''})`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addTransaction() }} className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ج.م)</label>
              <Input
                type="number"
                value={txForm.amount}
                onChange={(e) => setTxForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">البيان</label>
              <Input
                value={txForm.statement}
                onChange={(e) => setTxForm(f => ({ ...f, statement: e.target.value }))}
                placeholder="البيان..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">التاريخ</label>
              <Input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setTxDialog(p => ({ ...p, open: false }))}>إلغاء</Button>
              <Button type="submit">إضافة</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
