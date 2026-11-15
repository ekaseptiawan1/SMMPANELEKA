require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const pool = require('./lib/db');
const payment = require('./lib/payment');
const supplier = require('./lib/supplier');
const { webhookValid } = require('./lib/security');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'boostpanel.sid', secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

const rupiah = n => Number(n).toLocaleString('id-ID');
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, balance: Number(u.balance) });
async function audit(actor, action, details = {}) {
  await pool.query('INSERT INTO audit_logs(actor_id,action,details) VALUES($1,$2,$3)', [actor || null, action, details]);
}

app.get('/api/health', (req,res) => res.json({ ok: true, name: 'BoostPanel API' }));
app.post('/api/auth/register', rateLimit({ windowMs: 15*60*1000, limit: 8 }), async (req,res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || typeof password !== 'string' || password.length < 10) {
      return res.status(400).json({ error: 'Nama, email valid, dan password minimal 10 karakter wajib diisi.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,lower($2),$3) RETURNING *', [name.trim(), email, hash]);
    req.session.user = publicUser(rows[0]);
    res.json({ user: req.session.user });
  } catch (e) { res.status(400).json({ error: e.code === '23505' ? 'Email sudah terdaftar.' : 'Registrasi gagal.' }); }
});
app.post('/api/auth/login', rateLimit({ windowMs: 15*60*1000, limit: 10 }), async (req,res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email=lower($1) AND is_active=true', [email || '']);
  if (!rows[0] || !await bcrypt.compare(password || '', rows[0].password_hash)) return res.status(401).json({ error: 'Email atau password salah.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Gagal membuat sesi.' });
    req.session.user = publicUser(rows[0]);
    res.json({ user: req.session.user });
  });
});
app.post('/api/auth/logout', (req,res) => req.session.destroy(() => { res.clearCookie('boostpanel.sid'); res.json({ ok: true }); }));
app.get('/api/me', requireAuth, async (req,res) => {
  const { rows } = await pool.query('SELECT id,name,email,role,balance FROM users WHERE id=$1', [req.session.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Sesi tidak valid.' });
  req.session.user = publicUser(rows[0]); res.json({ user: req.session.user });
});
app.get('/api/services', async (req,res) => {
  const { rows } = await pool.query('SELECT id,platform,name,description,processing_time,rate,min_qty,max_qty FROM services WHERE active=true ORDER BY platform,name');
  res.json({ services: rows });
});
app.get('/api/payment-info', async (req,res) => {
  const { rows } = await pool.query("SELECT key,value FROM app_settings WHERE key = ANY($1)", [['sea_bank_account_name','sea_bank_account_number','admin_whatsapp_number']]);
  const settings = Object.fromEntries(rows.map(x => [x.key,x.value]));
  res.json({ bank: 'SEA BANK', account_name: settings.sea_bank_account_name || 'Rekening belum diatur admin', account_number: settings.sea_bank_account_number || 'Belum diatur', instructions: 'Transfer sesuai nominal, lalu isi nomor referensi/keterangan transfer. Setelah mengirim permintaan, lanjutkan ke WhatsApp admin. Saldo masuk setelah admin memeriksa dan menyetujui.', whatsapp_configured: /^[0-9]{8,15}$/.test(settings.admin_whatsapp_number || '') });
});
app.post('/api/deposits', requireAuth, async (req,res) => {
  const amount = Number(req.body.amount);
  const proof = String(req.body.proof_reference || '').trim();
  if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 50000000) return res.status(400).json({ error: 'Deposit minimal Rp10.000 dan maksimal Rp50.000.000.' });
  if (proof.length < 4 || proof.length > 120) return res.status(400).json({ error: 'Isi nomor referensi atau keterangan transfer (4–120 karakter).' });
  try {
    const { rows } = await pool.query("INSERT INTO deposits(user_id,amount,payment_method,proof_reference,payment_ref) VALUES($1,$2,'bank_transfer',$3,$4) RETURNING id,amount,status,created_at", [req.session.user.id, amount, proof, `SEA-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`]);
    const deposit = rows[0];
    const cfg = await pool.query("SELECT value FROM app_settings WHERE key='admin_whatsapp_number'");
    const waNumber = String(cfg.rows[0]?.value || '').replace(/\D/g, '');
    let whatsapp_url = null;
    if (/^[0-9]{8,15}$/.test(waNumber)) {
      const message = [
        'Halo Admin BoostPanel, saya ingin konfirmasi deposit SEA BANK.',
        `ID Deposit: #${deposit.id}`,
        `ID Member: ${req.session.user.id}`,
        `Nama Member: ${req.session.user.name}`,
        `Email Member: ${req.session.user.email}`,
        `Nominal: Rp${rupiah(deposit.amount)}`,
        `Referensi/Keterangan Transfer: ${proof}`,
        'Mohon periksa transfer saya. Saya memahami saldo ditambahkan setelah admin memverifikasi mutasi rekening.'
      ].join('\n');
      whatsapp_url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    }
    res.json({ deposit, whatsapp_url, message: whatsapp_url ? 'Permintaan deposit dibuat. Kamu akan diarahkan ke WhatsApp admin untuk mengirim konfirmasi.' : 'Permintaan deposit dibuat, tetapi nomor WhatsApp admin belum dikonfigurasi. Hubungi admin secara manual.' });
  } catch (e) { res.status(500).json({ error: 'Gagal membuat permintaan deposit.' }); }
});
app.post('/api/webhooks/payment', async (req,res) => {
  const signature = req.get('x-webhook-signature') || '';
  if (!webhookValid(req.rawBody, signature, process.env.PAYMENT_WEBHOOK_SECRET)) return res.status(401).json({ error: 'Signature tidak valid.' });
  const body = req.body || {};
  const externalId = String(body.external_id || body.reference || '');
  const status = String(body.status || '').toLowerCase();
  if (!externalId) return res.status(400).json({ error: 'Reference wajib ada.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM deposits WHERE payment_ref=$1 FOR UPDATE', [externalId]);
    const d = found.rows[0];
    if (!d) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deposit tidak ditemukan.' }); }
    if (['paid','settlement','success','completed'].includes(status) && d.status !== 'paid') {
      if (Number(body.amount) !== Number(d.amount)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nominal webhook tidak cocok.' }); }
      const u = await client.query('UPDATE users SET balance=balance+$1 WHERE id=$2 RETURNING balance', [d.amount,d.user_id]);
      await client.query("UPDATE deposits SET status='paid',paid_at=NOW() WHERE id=$1", [d.id]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference,note) VALUES($1,'deposit',$2,$3,$4,'Deposit terverifikasi via webhook')", [d.user_id,d.amount,u.rows[0].balance,externalId]);
    } else if (['failed','expired','cancelled'].includes(status) && d.status === 'pending') {
      await client.query('UPDATE deposits SET status=$1 WHERE id=$2', [status === 'cancelled' ? 'failed' : status,d.id]);
    }
    await client.query('COMMIT'); res.json({ received: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Webhook gagal diproses.' }); }
  finally { client.release(); }
});
app.post('/api/orders', requireAuth, async (req,res) => {
  const serviceId = Number(req.body.service_id), quantity = Number(req.body.quantity), target = String(req.body.target || '').trim();
  if (!Number.isSafeInteger(serviceId) || !Number.isSafeInteger(quantity) || !target || target.length > 1000) return res.status(400).json({ error: 'Data pesanan tidak valid.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sr = await client.query('SELECT * FROM services WHERE id=$1 AND active=true FOR UPDATE', [serviceId]);
    const s = sr.rows[0];
    if (!s || quantity < s.min_qty || quantity > s.max_qty) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Layanan tidak tersedia atau jumlah di luar batas.' }); }
    const charge = Math.ceil(Number(s.rate) * quantity / 1000);
    const ur = await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [req.session.user.id]);
    if (Number(ur.rows[0].balance) < charge) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Saldo tidak mencukupi. Silakan deposit.' }); }
    const order = await client.query("INSERT INTO orders(user_id,service_id,target,quantity,charge,status) VALUES($1,$2,$3,$4,$5,'processing') RETURNING id", [req.session.user.id,serviceId,target,quantity,charge]);
    const newBal = await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2 RETURNING balance', [charge,req.session.user.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference,note) VALUES($1,'order',$2,$3,$4,'Pembayaran pesanan')", [req.session.user.id,-charge,newBal.rows[0].balance,String(order.rows[0].id)]);
    await client.query('COMMIT');
    // Supplier call happens after durable local order and wallet debit. Failed supplier submissions
    // are marked for admin review; do not silently re-credit without reconciliation.
    try {
      const result = await supplier.createOrder({ service: s, target, quantity });
      const supplierId = result.order || result.order_id || result.id;
      await pool.query('UPDATE orders SET supplier_order_id=$1,status=$2,updated_at=NOW() WHERE id=$3', [supplierId ? String(supplierId) : null, result.status || 'pending', order.rows[0].id]);
    } catch (err) {
      await pool.query("UPDATE orders SET status='supplier_error',updated_at=NOW() WHERE id=$1", [order.rows[0].id]);
      await audit(req.session.user.id, 'supplier_order_error', { order_id: order.rows[0].id, message: err.message });
    }
    res.json({ order_id: order.rows[0].id, charge, message: 'Pesanan tercatat. Periksa status pesanan di dashboard.' });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Pesanan gagal diproses.' }); }
  finally { client.release(); }
});
app.post('/api/orders/bulk', requireAuth, async (req,res) => {
  const serviceId = Number(req.body.service_id), quantity = Number(req.body.quantity);
  const targets = [...new Set(String(req.body.targets || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  if (!Number.isSafeInteger(serviceId) || !Number.isSafeInteger(quantity) || !targets.length || targets.length > 50 || targets.some(x=>x.length>1000)) return res.status(400).json({ error: 'Isi 1–50 link berbeda, dan pastikan jumlah pesanan valid.' });
  const client = await pool.connect();
  let service, created=[];
  try {
    await client.query('BEGIN');
    const sr = await client.query('SELECT * FROM services WHERE id=$1 AND active=true FOR UPDATE', [serviceId]);
    service = sr.rows[0];
    if (!service || quantity < service.min_qty || quantity > service.max_qty) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Layanan tidak tersedia atau jumlah di luar batas.' }); }
    const eachCharge = Math.ceil(Number(service.rate) * quantity / 1000);
    const totalCharge = eachCharge * targets.length;
    const ur = await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [req.session.user.id]);
    if (!ur.rows[0] || Number(ur.rows[0].balance) < totalCharge) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Saldo tidak mencukupi untuk seluruh link. Silakan deposit.' }); }
    for (const target of targets) {
      const order = await client.query("INSERT INTO orders(user_id,service_id,target,quantity,charge,status) VALUES($1,$2,$3,$4,$5,'processing') RETURNING id", [req.session.user.id,serviceId,target,quantity,eachCharge]);
      created.push({id:order.rows[0].id,target,quantity,charge:eachCharge});
    }
    const newBal = await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2 RETURNING balance', [totalCharge,req.session.user.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference,note) VALUES($1,'order',$2,$3,$4,$5)", [req.session.user.id,-totalCharge,newBal.rows[0].balance,created.map(x=>x.id).join(','),'Pembayaran pesanan massal ('+created.length+' link)']);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Pesanan massal gagal diproses.' }); }
  finally { client.release(); }
  let success=0, failed=0;
  for (const order of created) {
    try {
      const result = await supplier.createOrder({ service, target:order.target, quantity:order.quantity });
      const supplierId = result.order || result.order_id || result.id;
      await pool.query('UPDATE orders SET supplier_order_id=$1,status=$2,updated_at=NOW() WHERE id=$3', [supplierId ? String(supplierId) : null, result.status || 'pending', order.id]);
      success++;
    } catch (err) {
      await pool.query("UPDATE orders SET status='supplier_error',updated_at=NOW() WHERE id=$1", [order.id]);
      await audit(req.session.user.id, 'supplier_order_error', { order_id:order.id, message:err.message });
      failed++;
    }
  }
  res.json({ order_ids:created.map(x=>x.id), count:created.length, success, failed, charge:created.reduce((n,x)=>n+x.charge,0), message:'Pesanan massal diproses untuk '+created.length+' link.' });
});
app.get('/api/member/summary', requireAuth, async (req,res) => {
  const id = req.session.user.id;
  const [orders,deposits,tx] = await Promise.all([
    pool.query('SELECT o.id,o.target,o.quantity,o.charge,o.status,o.created_at,s.platform,s.name AS service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 30',[id]),
    pool.query('SELECT id,amount,status,payment_url,created_at FROM deposits WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[id]),
    pool.query('SELECT type,amount,balance_after,reference,note,created_at FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[id])
  ]);
  res.json({ orders: orders.rows, deposits: deposits.rows, transactions: tx.rows });
});
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req,res) => {
  const { rows } = await pool.query("SELECT key,value FROM app_settings WHERE key = ANY($1)", [['sea_bank_account_name','sea_bank_account_number','admin_whatsapp_number']]);
  res.json({ settings: Object.fromEntries(rows.map(x => [x.key,x.value])) });
});
app.put('/api/admin/settings', requireAuth, requireAdmin, async (req,res) => {
  const fields = { sea_bank_account_name: String(req.body.sea_bank_account_name || '').trim(), sea_bank_account_number: String(req.body.sea_bank_account_number || '').replace(/\s/g,''), admin_whatsapp_number: String(req.body.admin_whatsapp_number || '').replace(/\D/g,'') };
  if (fields.sea_bank_account_name.length > 120 || fields.sea_bank_account_number.length > 40 || (fields.admin_whatsapp_number && !/^[0-9]{8,15}$/.test(fields.admin_whatsapp_number))) return res.status(400).json({ error: 'Data rekening atau nomor WhatsApp tidak valid.' });
  for (const [key,value] of Object.entries(fields)) await pool.query('INSERT INTO app_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()', [key,value]);
  await audit(req.session.user.id,'settings_updated',{ keys:Object.keys(fields) });
  res.json({ ok:true });
});
app.put('/api/member/account', requireAuth, async (req,res) => {
  if (req.session.user.role !== 'member') return res.status(403).json({ error: 'Akses khusus member.' });
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const currentPassword = req.body.current_password;
  const newPassword = req.body.new_password;
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Nama atau email tidak valid.' });
  if (typeof currentPassword !== 'string' || !currentPassword) return res.status(400).json({ error: 'Masukkan password saat ini untuk konfirmasi.' });
  if (newPassword && (typeof newPassword !== 'string' || newPassword.length < 10)) return res.status(400).json({ error: 'Password baru minimal 10 karakter.' });
  try {
    const found = await pool.query('SELECT password_hash FROM users WHERE id=$1 AND role=\'member\'', [req.session.user.id]);
    if (!found.rows[0] || !await bcrypt.compare(currentPassword, found.rows[0].password_hash)) return res.status(401).json({ error: 'Password saat ini salah.' });
    const hash = newPassword ? await bcrypt.hash(newPassword,12) : null;
    const { rows } = await pool.query('UPDATE users SET name=$1,email=$2,password_hash=COALESCE($3,password_hash) WHERE id=$4 AND role=\'member\' RETURNING id,name,email,role,balance', [name,email,hash,req.session.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Akun member tidak ditemukan.' });
    req.session.user = publicUser(rows[0]);
    await audit(rows[0].id,'member_account_updated',{ name_changed:true,email_changed:true,password_changed:Boolean(newPassword) });
    res.json({ ok:true,user:req.session.user });
  } catch(e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'Email sudah digunakan akun lain.' : 'Gagal memperbarui akun member.' }); }
});
app.put('/api/admin/account', requireAuth, requireAdmin, async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email admin tidak valid.' });
  if (password && (typeof password !== 'string' || password.length < 12)) return res.status(400).json({ error: 'Password baru minimal 12 karakter.' });
  try {
    const hash = password ? await bcrypt.hash(password,12) : null;
    const { rows } = await pool.query('UPDATE users SET email=$1,password_hash=COALESCE($2,password_hash) WHERE id=$3 AND role=\'admin\' RETURNING id,name,email,role,balance', [email,hash,req.session.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Akun admin tidak ditemukan.' });
    req.session.user = publicUser(rows[0]);
    await audit(rows[0].id,'admin_account_updated',{ email_changed:true,password_changed:Boolean(password) });
    res.json({ ok:true,user:req.session.user });
  } catch(e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'Email sudah digunakan.' : 'Gagal memperbarui akun admin.' }); }
});
app.get('/api/admin/overview', requireAuth, requireAdmin, async (req,res) => {
  const [users,orders,deposits,revenue] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM users WHERE role=$1',['member']),
    pool.query('SELECT COUNT(*)::int AS total FROM orders'),
    pool.query("SELECT COUNT(*)::int AS total FROM deposits WHERE status='pending'"),
    pool.query("SELECT COALESCE(SUM(charge),0)::bigint AS total FROM orders WHERE status NOT IN ('cancelled','refunded')")
  ]);
  res.json({ members: users.rows[0].total, orders: orders.rows[0].total, pending_deposits: deposits.rows[0].total, gross_sales: Number(revenue.rows[0].total) });
});
app.get('/api/admin/users', requireAuth, requireAdmin, async (req,res) => {
  const { rows } = await pool.query('SELECT id,name,email,role,balance,is_active,created_at FROM users ORDER BY created_at DESC LIMIT 200');
  res.json({ users: rows });
});
app.get('/api/admin/orders', requireAuth, requireAdmin, async (req,res) => {
  const { rows } = await pool.query('SELECT o.*,u.email,s.platform,s.name AS service_name FROM orders o JOIN users u ON u.id=o.user_id JOIN services s ON s.id=o.service_id ORDER BY o.created_at DESC LIMIT 300');
  res.json({ orders: rows });
});
app.get('/api/admin/deposits', requireAuth, requireAdmin, async (req,res) => {
  const { rows } = await pool.query('SELECT d.*,u.id AS member_id,u.name AS member_name,u.email FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 300');
  res.json({ deposits: rows });
});
app.patch('/api/admin/deposits/:id/review', requireAuth, requireAdmin, async (req,res) => {
  const action = String(req.body.action || '');
  const note = String(req.body.note || '').slice(0,500);
  if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'Aksi tidak valid.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM deposits WHERE id=$1 FOR UPDATE', [req.params.id]);
    const d = found.rows[0];
    if (!d) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Deposit tidak ditemukan.' }); }
    if (d.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Deposit ini sudah diproses.' }); }
    if (action === 'approve') {
      const u = await client.query('UPDATE users SET balance=balance+$1 WHERE id=$2 RETURNING balance', [d.amount,d.user_id]);
      await client.query("UPDATE deposits SET status='paid',paid_at=NOW(),admin_note=$1 WHERE id=$2", [note,d.id]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference,note) VALUES($1,'deposit',$2,$3,$4,'Deposit SEA BANK disetujui admin')", [d.user_id,d.amount,u.rows[0].balance,String(d.id)]);
    } else {
      await client.query("UPDATE deposits SET status='failed',admin_note=$1 WHERE id=$2", [note || 'Ditolak admin',d.id]);
    }
    await audit(req.session.user.id, `deposit_${action}`, { deposit_id:d.id, amount:Number(d.amount), note });
    await client.query('COMMIT');
    res.json({ ok:true, status: action === 'approve' ? 'paid' : 'failed' });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Gagal memproses deposit.' }); }
  finally { client.release(); }
});
app.post('/api/admin/services', requireAuth, requireAdmin, async (req,res) => {
  const { platform,name,description='',processing_time='Estimasi mengikuti antrean supplier',supplier_service_id=null,supplier_rate=0,rate,min_qty=100,max_qty=100000 } = req.body || {};
  if (!platform || !name || !Number.isSafeInteger(Number(rate)) || Number(rate)<0 || !Number.isSafeInteger(Number(supplier_rate)) || Number(supplier_rate)<0 || !Number.isSafeInteger(Number(min_qty)) || Number(min_qty)<1 || !Number.isSafeInteger(Number(max_qty)) || Number(max_qty)<Number(min_qty)) return res.status(400).json({ error: 'Data layanan tidak valid. Periksa harga dan batas minimum/maksimum.' });
  const { rows } = await pool.query('INSERT INTO services(platform,name,description,processing_time,supplier_service_id,supplier_rate,rate,min_qty,max_qty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[platform,name,String(description).slice(0,2000),String(processing_time).slice(0,120),supplier_service_id,Number(supplier_rate),Number(rate),Number(min_qty),Number(max_qty)]);
  await audit(req.session.user.id,'service_created',{service_id:rows[0].id});
  res.json({ service: rows[0] });
});
app.get('/api/admin/supplier-services', requireAuth, requireAdmin, async (req,res) => {
  try {
    const result = await supplier.listServices();
    const list = Array.isArray(result) ? result : (result.services || result.data || []);
    const services = list.map(x => ({
      service_id: String(x.service || x.id || x.service_id || ''),
      category: String(x.category || x.platform || 'Other'),
      name: String(x.name || x.description || ''),
      rate: Math.max(0,Math.round(Number(x.rate ?? x.price ?? 0))),
      min: Math.max(1,Number(x.min ?? x.min_qty ?? 1)),
      max: Math.max(1,Number(x.max ?? x.max_qty ?? 1))
    })).filter(x => x.service_id && x.name);
    res.json({ services });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/admin/sync-supplier', requireAuth, requireAdmin, async (req,res) => {
  try {
    const result = await supplier.listServices();
    const list = Array.isArray(result) ? result : (result.services || result.data || []);
    let count = 0;
    for (const x of list) {
      const sid = String(x.service || x.id || x.service_id || '');
      if (!sid) continue;
      const platform = String(x.category || x.platform || 'Other');
      const name = String(x.name || x.description || `Service ${sid}`);
      const supplierRate = Math.max(0,Math.round(Number(x.rate || x.price || 0)));
      const min = Math.max(1,Number(x.min || x.min_qty || 100));
      const max = Math.max(min,Number(x.max || x.max_qty || 100000));
      await pool.query(`INSERT INTO services(supplier_service_id,platform,name,supplier_rate,rate,min_qty,max_qty,active)
        VALUES($1,$2,$3,$4,0,$5,$6,false)
        ON CONFLICT (supplier_service_id) WHERE supplier_service_id IS NOT NULL
        DO UPDATE SET supplier_rate=EXCLUDED.supplier_rate,platform=EXCLUDED.platform,name=EXCLUDED.name,
          min_qty=EXCLUDED.min_qty,max_qty=EXCLUDED.max_qty,updated_at=NOW()`,[sid,platform,name,supplierRate,min,max]);
      count++;
    }
    res.json({ imported: count, message: 'Sinkronisasi selesai; periksa harga dan mapping sebelum layanan diaktifkan.' });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/admin/orders/:id/refresh', requireAuth, requireAdmin, async (req,res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1',[req.params.id]);
  if (!rows[0] || !rows[0].supplier_order_id) return res.status(400).json({ error: 'ID supplier belum tersedia.' });
  try {
    const result = await supplier.getOrderStatus(rows[0].supplier_order_id);
    const status = String(result.status || 'pending').toLowerCase();
    await pool.query('UPDATE orders SET status=$1,start_count=$2,remains=$3,updated_at=NOW() WHERE id=$4',[status,result.start_count || null,result.remains || null,req.params.id]);
    res.json({ status });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Admin accounts are created with the private CLI command; no admin credentials live in environment variables.
const port = Number(process.env.PORT || 3000);
pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS processing_time VARCHAR(120) NOT NULL DEFAULT 'Estimasi mengikuti antrean supplier'")
  .then(() => app.listen(port, () => console.log(`BoostPanel berjalan pada port ${port}`)))
  .catch(err => { console.error('Gagal menyiapkan kolom detail layanan:', err.message); process.exit(1); });
