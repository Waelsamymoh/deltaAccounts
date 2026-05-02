export function formatCurrency(amount: number): string {
  return Math.round(amount).toLocaleString('en-US')
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB').replace(/\//g, '/')
}
