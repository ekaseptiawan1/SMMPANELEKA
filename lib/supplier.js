// Generic supplier adapter. Confirm endpoint paths, auth header and payload format
// against your supplier's official API documentation before enabling live orders.
async function request(path, options = {}) {
  if (!process.env.SUPPLIER_API_URL || !process.env.SUPPLIER_API_KEY) {
    throw new Error('Supplier API belum dikonfigurasi');
  }
  const base = process.env.SUPPLIER_API_URL.replace(/\/$/, '');
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPPLIER_API_KEY}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Supplier HTTP ${response.status}`);
  return data;
}
async function listServices() {
  return request(process.env.SUPPLIER_SERVICES_PATH || '/services');
}
async function createOrder({ service, target, quantity }) {
  return request(process.env.SUPPLIER_ORDER_PATH || '/orders', {
    method: 'POST', body: JSON.stringify({ service: service.supplier_service_id, link: target, quantity })
  });
}
async function getOrderStatus(supplierOrderId) {
  const path = (process.env.SUPPLIER_STATUS_PATH || '/orders').replace(/\/$/, '');
  return request(`${path}/${encodeURIComponent(supplierOrderId)}`);
}
module.exports = { listServices, createOrder, getOrderStatus };
