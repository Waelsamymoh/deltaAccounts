export interface BankAccount {
  id: string
  client_name: string
  bank_name: string
  account_number: string
  iban: string | null
  phone: string | null
  balance: number
  position: number
  created_at: string
}

export interface Category {
  id: string
  name: string
  pieces_count: number
  created_at: string
}

export interface Setting {
  id: string
  key: string
  value: string
  created_at: string
}

export interface Debt {
  id: string
  debtor_name: string
  amount: number
  date: string
  created_at: string
}

export interface Investor {
  id: string
  investor_name: string
  amount: number
  date: string
  created_at: string
}

export interface Creditor {
  id: string
  creditor_name: string
  amount: number
  date: string
  created_at: string
}

export interface InvestorProfile {
  id: string
  name: string
  share_price: number
  notes: string | null
  created_at: string
}

export interface InvestorEntry {
  id: string
  investor_id: string
  type: 'assets_in' | 'assets_out' | 'profit'
  amount: number
  statement: string | null
  date: string
  created_at: string
}

export interface ManagerTransaction {
  id: string
  type: 'in' | 'out'
  amount: number
  statement: string | null
  date: string
  created_at: string
}

export interface ManagerMonth {
  id: string
  year_month: string
  investment_start: number
  profits: number
  created_at: string
}

export interface ManagerMonthTransaction {
  id: string
  month_id: string
  type: 'in' | 'out'
  amount: number
  statement: string | null
  date: string
  source_tx_id: string | null
  created_at: string
}

export interface ManagerMonthDaily {
  id: string
  month_id: string
  daily_profit: number
  balance: number
  date: string
  notes: string | null
  created_at: string
}

export interface ManagerMonthReport {
  id: string
  month_id: string
  amount_in: number
  amount_out: number
  profits: number
  balance_after_profit: number
  notes: string | null
  date: string
  created_at: string
}

export interface OthersFund {
  id: string
  date: string
  manager_capital: number           // اصل المال للمدير
  manager_additional_funds: number  // اموال اضافية من المدير
  manager_balance_start: number     // رصيد البداية للمدير
  investor_balance_start: number    // رصيد البداية للمستثمر
  share_ratio: number               // عدد الاسهم
  current_profit: number            // الربح الحالى
  notes: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      bank_accounts: {
        Row: BankAccount
        Insert: Omit<BankAccount, 'id' | 'created_at'>
        Update: Partial<Omit<BankAccount, 'id' | 'created_at'>>
        Relationships: []
      }
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at'>
        Update: Partial<Omit<Category, 'id' | 'created_at'>>
        Relationships: []
      }
      settings: {
        Row: Setting
        Insert: Omit<Setting, 'id' | 'created_at'>
        Update: Partial<Omit<Setting, 'id' | 'created_at'>>
        Relationships: []
      }
      debts: {
        Row: Debt
        Insert: Omit<Debt, 'id' | 'created_at'>
        Update: Partial<Omit<Debt, 'id' | 'created_at'>>
        Relationships: []
      }
      investors: {
        Row: Investor
        Insert: Omit<Investor, 'id' | 'created_at'>
        Update: Partial<Omit<Investor, 'id' | 'created_at'>>
        Relationships: []
      }
      creditors: {
        Row: Creditor
        Insert: Omit<Creditor, 'id' | 'created_at'>
        Update: Partial<Omit<Creditor, 'id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
