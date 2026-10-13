// Offered as choices; the schema stores the method as free text, so older
// records with other wording still display correctly.
export const PAYMENT_METHODS = ['Cash', 'Mobile money', 'Card', 'Bank transfer'] as const

/** Opens the printable receipt in its own tab, which shares the signed-in session. */
export function openReceipt(orderId: string) {
  window.open(`${window.location.pathname}#/receipt/${orderId}`, '_blank', 'noopener')
}
