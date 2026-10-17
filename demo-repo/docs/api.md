# API overview

## `calcInvoice(items, taxRate, discountCode?)`
Totals an invoice in cents. Discount codes: `WELCOME10` (10%), `VIP25` (25%).

## `validateLogin(email, password)`
Checks that credentials are present. Intentionally naive: a good first task for an agent.

## `formatMoney(cents, currency)`
Formats cents as money. USD only for now.
