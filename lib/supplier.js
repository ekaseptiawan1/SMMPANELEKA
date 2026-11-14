// IndoSMM API v2 adapter. Keep the API key only in the server-side .env file.
const API_URL = process.env.SUPPLIER_API_URL || 'https://indosmm.id/api/v2';

async function request(params) {
  const key = process.env.SUPPLIER_API_KEY;
  if (!key) throw new Error('SUPPLIER_API_KEY belum diatur di .env');

  const body = new URLSearchParams({ key, ...params });
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000)
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`Respons IndoSMM bukan JSON (HTTP ${response.status}). Periksa endpoint API.`); }

  if (!response.ok) throw new Error(data.error || data.message || `IndoSMM HTTP ${response.status}`);
  if (data && !Array.isArray(data) && data.error) throw new Error(String(data.error));
  return data;
}

async function listServices() {
  const data = await request({ action: 'services' });
  if (!Array.isArray(data)) throw new Error('Format daftar layanan IndoSMM tidak sesuai dokumentasi.');
  return data;
}

async function createOrder({ service, target, quantity }) {
  if (!service?.supplier_service_id) throw new Error('ID layanan provider belum tersedia.');
  const data = await request({
    action: 'add',
    service: String(service.supplier_service_id),
    link: String(target),
    quantity: String(quantity)
  });
  if (data.error) throw new Error(String(data.error));
  if (!data.order) throw new Error('IndoSMM tidak mengembalikan ID pesanan.');
  return { order: data.order, status: 'pending' };
}

async function getOrderStatus(supplierOrderId) {
  const data = await request({ action: 'status', order: String(supplierOrderId) });
  if (data.error) throw new Error(String(data.error));
  return data;
}

async function getBalance() {
  const data = await request({ action: 'balance' });
  if (data.error) throw new Error(String(data.error));
  return data;
}

module.exports = { listServices, createOrder, getOrderStatus, getBalance };
