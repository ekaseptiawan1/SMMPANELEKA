// Generic payment adapter. Map request/response fields to your payment provider.
// Never mark a deposit paid from the browser; only the verified webhook can credit balance.
async function createInvoice({ depositId, amount, customer }) {
  if (!process.env.PAYMENT_API_URL || !process.env.PAYMENT_API_KEY) {
    throw new Error('Payment gateway belum dikonfigurasi');
  }
  const response = await fetch(process.env.PAYMENT_API_URL.replace(/\/$/, '') + '/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.PAYMENT_API_KEY}` },
    body: JSON.stringify({ external_id: `boostpanel-deposit-${depositId}`, amount, customer })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Payment HTTP ${response.status}`);
  return data;
}
module.exports = { createInvoice };
