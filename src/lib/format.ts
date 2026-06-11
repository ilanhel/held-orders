/**
 * Format an agorot integer (e.g. 12900) into a Hebrew display string.
 * Returns "129.00 ₪"
 */
export function formatPrice(agorot: number): string {
  const shekels = agorot / 100
  return `${shekels.toFixed(2)} ₪`
}

/**
 * Format an integer total to Hebrew thousands-separated string with currency.
 */
export function formatTotal(agorot: number): string {
  const shekels = agorot / 100
  return `${shekels.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`
}
