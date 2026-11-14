# BoostPanel — Full-stack SMM Panel Starter

Starter full-stack untuk dikembangkan menjadi panel SMM. Termasuk registrasi/login, saldo member, pencatatan mutasi, deposit transfer bank manual SEA BANK dengan verifikasi admin, order dengan debit saldo transaksional, adapter supplier generik, dan dashboard admin.

## Penting sebelum live
- Ini adalah **starter integrasi**, bukan koneksi langsung ke provider tertentu. Payment gateway dan supplier mempunyai format API/webhook berbeda. Sesuaikan `lib/payment.js`, `lib/supplier.js`, dan verifikasi signature webhook berdasarkan dokumentasi resmi provider pilihan.
- Jangan mengaktifkan deposit live sebelum webhook signature, amount, status, idempotensi, dan URL callback diuji di sandbox.
- Jangan menaruh API key di frontend atau mengirimkannya ke browser.
- Gunakan layanan promosi yang mematuhi ketentuan platform sosial media. Hindari layanan yang menjanjikan aktivitas palsu atau melanggar aturan platform.
- Terapkan HTTPS, backup database, monitoring, kebijakan refund, batas transaksi, dan audit sebelum produksi.

## Kebutuhan
- Node.js 20+
- PostgreSQL 14+
- Akun payment gateway dan supplier dengan API yang sah

## Instalasi lokal
1. Buat database PostgreSQL bernama `boostpanel`.
2. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL` dan `SESSION_SECRET`. Jangan masukkan kredensial admin, rekening, atau WhatsApp ke file `.env`/GitHub.
3. Jalankan:
   ```bash
   npm install
   npm run db:init
   npm start
   ```
4. Buat akun admin secara privat melalui terminal server: `npm run admin:create` (email dan password diminta interaktif).
5. Jalankan `npm start`, login memakai akun tersebut, lalu isi rekening SEA BANK dan WhatsApp melalui bagian Pengaturan Admin.

## Deposit transfer SEA BANK (manual)
Isi nama pemilik rekening, nomor rekening, dan WhatsApp melalui **Pengaturan Admin**. Nilai disimpan di tabel `app_settings` dalam PostgreSQL (format internasional angka saja, misalnya `6281234567890`, tanpa tanda `+`, spasi, atau strip). Setelah member membuat permintaan deposit, browser diarahkan ke `wa.me` dengan pesan berisi ID deposit, ID/nama/email member, nominal, serta referensi transfer. Admin juga melihat ID member dan nama di daftar deposit. Jika nomor WhatsApp belum diisi dengan benar, permintaan tetap tersimpan tetapi member tidak otomatis diarahkan ke WhatsApp. Member membuat permintaan deposit, mentransfer sesuai nominal, lalu mengisi nomor referensi/keterangan transfer. Admin memeriksa mutasi rekening SEA BANK secara langsung dan menekan **Setujui** atau **Tolak** pada dashboard. Saldo hanya ditambahkan satu kali ketika status pending disetujui dalam transaksi database.

**Penting:** sistem ini tidak terhubung ke API SEA BANK dan tidak dapat mendeteksi transfer otomatis. Jangan menyetujui hanya berdasarkan screenshot/nomor referensi; cocokkan nominal, waktu, dan transaksi pada rekening. Jangan meminta atau menyimpan PIN, password, OTP, atau kredensial mobile banking.

## Pengaturan harga jual
- `supplier_rate` menyimpan harga modal per 1.000 dari supplier.
- `rate` menyimpan harga jual per 1.000 yang ditampilkan kepada member dan dipakai menghitung tagihan order.
- Admin dapat mengubah harga jual dari tabel **Atur harga jual layanan**. Saat sinkronisasi katalog, harga modal diperbarui tetapi harga jual yang sudah ditentukan admin tidak ditimpa. Layanan baru memakai harga supplier sebagai harga jual awal; sesuaikan sebelum dipasarkan.
- Untuk database lama, jalankan `npm run db:init` agar kolom modal dan index unik supplier ditambahkan otomatis oleh schema terbaru.

## Konfigurasi supplier
Isi `SUPPLIER_API_URL`, `SUPPLIER_API_KEY`, serta path pada `.env`. Adapter contoh mengasumsikan Bearer token dan endpoint REST:
- `GET /services`
- `POST /orders` dengan `{ "service": "...", "link": "...", "quantity": 1000 }`
- `GET /orders/{supplierOrderId}`

Sesuaikan auth, path, payload, serta mapping status dengan dokumentasi supplier. Setelah itu gunakan tombol sinkron katalog dari dashboard admin. Periksa harga dan layanan sebelum ditampilkan ke member.

## Endpoint inti
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- `GET /api/services`, `GET /api/payment-info`
- `POST /api/deposits` (manual SEA BANK), `PATCH /api/admin/deposits/:id/review`
- `POST /api/orders`, `GET /api/member/summary`
- Admin: `/api/admin/overview`, `/users`, `/orders`, `/deposits`, `/services`, `/settings`, `/account`, `/sync-supplier`

## Catatan teknis / pekerjaan lanjutan
- Tambahkan CSRF protection untuk deployment lintas-origin atau ubah autentikasi ke pola yang sesuai; pertahankan cookie `SameSite` dan origin allowlist.
- Buat adapter provider spesifik dan uji signature webhook dengan fixture asli dari sandbox.
- Buat worker/queue untuk retry status supplier dan rekonsiliasi order `supplier_error`; jangan refund otomatis tanpa kebijakan dan pemeriksaan idempotensi.
- Implementasikan refresh status order terjadwal, pagination, filter, export, reset password, verifikasi email, 2FA admin, serta pembatasan IP untuk panel admin.
- Terapkan kebijakan harga/markup dan pemisahan harga supplier dari harga jual jika dibutuhkan.
- Tambahkan unit/integration tests sebelum produksi.


## Kredensial dan pengaturan privat
- Email admin disimpan pada `users.email`; password hanya disimpan sebagai hash bcrypt di `users.password_hash`.
- Buat admin pertama dengan `npm run admin:create` di terminal hosting/server. Perintah menolak membuat akun admin kedua bila sudah ada admin.
- Email dan password admin dapat diganti setelah login melalui bagian Akun Admin di dashboard.
- Nama rekening SEA BANK, nomor rekening, dan nomor WhatsApp admin disimpan di tabel `app_settings` dan diedit dari Pengaturan Pembayaran.
- Jangan commit `.env`, backup database, atau kredensial. Jika sebelumnya kredensial pernah terunggah, segera ganti.
