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

function serviceOrderType(service) {
  const type = String(service?.service_type || service?.type || 'Default').toLowerCase();
  if (type.includes('subscription')) return 'subscriptions';
  if (type.includes('custom') && type.includes('comment')) return 'custom_comments';
  if (type.includes('mention')) return 'mentions';
  if (type.includes('poll')) return 'poll';
  if (type.includes('package')) return 'package';
  return 'default';
}

async function createOrder({ service, target, quantity, orderData = {} }) {
  if (!service?.supplier_service_id) throw new Error('ID layanan provider belum tersedia.');
  const type = serviceOrderType(service);
  const params = { action: 'add', service: String(service.supplier_service_id) };
  if (type === 'subscriptions') {
    const username = String(orderData.username || '').trim().replace(/^@/, '');
    const min = Number(orderData.min), max = Number(orderData.max);
    if (!username || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) {
      throw new Error('Data layanan Subscriptions belum lengkap.');
    }
    params.username = username;
    params.min = String(min);
    params.max = String(max);
    params.posts = String(Number(orderData.posts || 0));
    params.old_posts = orderData.old_posts ? '1' : '0';
    params.delay = String(Number(orderData.delay || 0));
  } else {
    params.link = String(target || '').trim();
    if (type === 'package') {
      // Package services are submitted with the target link only.
    } else if (type === 'custom_comments') {
      const comments = String(orderData.comments || '').trim();
      if (!comments) throw new Error('Daftar komentar wajib diisi.');
      params.comments = comments;
    } else if (type === 'mentions') {
      const usernames = String(orderData.usernames || '').trim();
      if (!usernames) throw new Error('Username yang akan di-mention wajib diisi.');
      params.usernames = usernames;
    } else if (type === 'poll') {
      params.quantity = String(quantity);
      params.answer_number = String(Number(orderData.answer_number));
    } else {
      params.quantity = String(quantity);
    }
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

module.exports = { listServices, createOrder, getOrderStatus, getBalance, serviceOrderType };
