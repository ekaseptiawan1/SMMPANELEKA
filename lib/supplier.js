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

async function createOrder({ service, target, quantity, username, min, max }) {
  if (!service?.supplier_service_id) throw new Error('ID layanan provider belum tersedia.');
  const isSubscription = String(service.service_type || service.type || '').toLowerCase().includes('subscription');
  const params = { action: 'add', service: String(service.supplier_service_id) };
  if (isSubscription) {
    const account = String(username || target || '').trim().replace(/^@/, '');
    const minCount = Number(min), maxCount = Number(max);
    if (!account || !Number.isSafeInteger(minCount) || !Number.isSafeInteger(maxCount) || minCount < 1 || maxCount < minCount) {
      throw new Error('Untuk layanan Subscriptions, isi username, jumlah minimal, dan jumlah maksimal.');
    }
    params.username = account;
    params.min = String(minCount);
    params.max = String(maxCount);
    params.delay = '0';
  } else {
    params.link = String(target);
    params.quantity = String(quantity);
  }
  const data = await request(params);
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
