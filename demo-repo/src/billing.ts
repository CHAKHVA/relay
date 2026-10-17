export interface InvoiceItem {
  description: string;
  /** Unit price in cents. */
  unitCents: number;
  quantity: number;
}

export interface Invoice {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

const DISCOUNTS: Record<string, number> = { WELCOME10: 0.1, VIP25: 0.25 };

/** Totals an invoice. `taxRate` is a fraction (0.18 = 18%). Unknown discount codes are ignored. */
export function calcInvoice(items: InvoiceItem[], taxRate: number, discountCode?: string): Invoice {
  const subtotalCents = items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
  const rate = discountCode ? (DISCOUNTS[discountCode.toUpperCase()] ?? 0) : 0;
  const discountCents = Math.round(subtotalCents * rate);
  const taxCents = Math.round((subtotalCents - discountCents) * taxRate);
  return { subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}
