// TODO: support EUR and GEL (symbol, decimal separator) in addition to USD.
export function formatMoney(cents: number, currency = 'USD'): string {
  if (currency !== 'USD') throw new Error(`Unsupported currency: ${currency}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}
