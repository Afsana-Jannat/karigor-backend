export function hasValidBkashMerchantInvoice(
  merchantInvoiceNumber: string | undefined,
  paymentId: string,
) {
  return (
    merchantInvoiceNumber === undefined || merchantInvoiceNumber === paymentId
  );
}
