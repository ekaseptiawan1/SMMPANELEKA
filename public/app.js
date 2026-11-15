const $=s=>document.querySelector(s);const money=n=>'Rp'+Number(n||0).toLocaleString('id-ID');let currentUser=null;let catalog=[];
async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Permintaan gagal');return d}
function toast(msg){const el=$('#message');el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',4200)}
function table(rows,cols){if(!rows?.length)return '<p class="muted">Belum ada data.</p>';return '<table><thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+cols.map(c=>`<td>${String(row[c[0]]??'—').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</td>`).join('')+'</tr>').join('')+'</tbody></table>'}
async function loadPaymentInfo(){const d=await api('/payment-info');$('#bank-info').innerHTML=`<b>${d.bank}</b><br>Atas nama: ${d.account_name}<br>No. rekening: <b>${d.account_number}</b><br><small>${d.instructions}</small>`}
function esc(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}
function renderSelectedServiceInfo(){const s=catalog.find(x=>String(x.id)===String($('#service-select').value));const el=$('#selected-service-info');const qty=$('#order-quantity');if(!el)return;if(!s){el.textContent='Pilih layanan terlebih dahulu.';if(qty){qty.removeAttribute('max');qty.min='1'}return}if(qty){qty.min=String(s.min_qty||1);qty.max=String(s.max_qty||'');const current=Number(qty.value||0);if(current<Number(s.min_qty||1))qty.value=s.min_qty;if(s.max_qty&&current>Number(s.max_qty))qty.value=s.max_qty}el.innerHTML='<b>'+esc(s.platform)+' · '+esc(s.name)+'</b><br>Harga: <b>'+money(s.rate)+'</b> per 1.000<br>Minimal: '+esc(s.min_qty)+' · Maksimal: '+esc(s.max_qty)+'<br>Estimasi proses: '+esc(s.processing_time||'Mengikuti antrean supplier')+'<br><small>'+esc(s.description||'Deskripsi layanan belum ditambahkan admin.')+'</small>';}
async function loadServices(){const d=await api('/services');catalog=d.services;$('#services').innerHTML=catalog.length?catalog.map(s=>'<div class="service"><b>'+esc(s.platform)+' — '+esc(s.name)+'</b><p>'+esc(s.description||'Deskripsi layanan belum tersedia.')+'</p><small>'+money(s.rate)+' / 1.000 · Min '+s.min_qty+' · Maks '+s.max_qty+'</small><small>Estimasi proses: '+esc(s.processing_time||'Mengikuti antrean supplier')+'</small></div>').join(''):'<p class="muted">Katalog belum diisi admin.</p>';const selected=$('#service-select').value;const groups=new Map();catalog.forEach(s=>{const key=s.platform||'Lainnya';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)});$('#service-select').innerHTML='<option value="">Pilih layanan...</option>'+[...groups].sort((a,b)=>a[0].localeCompare(b[0],'id')).map(([category,items])=>'<optgroup label="'+esc(category)+'">'+items.map(s=>'<option value="'+s.id+'">'+esc(s.name)+' — '+money(s.rate)+'/1k</option>').join('')+'</optgroup>').join('');if(catalog.some(s=>String(s.id)===selected))$('#service-select').value=selected;else if(catalog.length)$('#service-select').value=String(catalog[0].id);renderSelectedServiceInfo()}
async function refresh(){
 const d=await api('/me');
 currentUser=d.user;
 document.body.classList.remove('auth-view');
 document.body.classList.add('authenticated');
 document.body.classList.toggle('admin-view',currentUser.role==='admin');
 history.replaceState(null,'',location.pathname);
 $('#auth-entry').classList.add('hidden');
 $('#nav-user').textContent=currentUser.name;
 $('#member-profile-menu').classList.toggle('hidden',currentUser.role!=='member');
 $('#header-avatar').textContent=(currentUser.name||'M').trim().charAt(0).toUpperCase();
 $('#dropdown-name').textContent=currentUser.name;
 $('#dropdown-email').textContent=currentUser.email;
 $('#login').classList.add('hidden');
 $('#register').classList.add('hidden');
 $('#dashboard').classList.toggle('hidden',currentUser.role==='admin');
 $('#admin').classList.toggle('hidden',currentUser.role!=='admin');
 $('#welcome').textContent=`Halo, ${currentUser.name} · ${currentUser.email}`;
 $('#balance').textContent=money(currentUser.balance);
 if(currentUser.role==='admin'){
   showAdminPage('admin-dashboard-page');
   await loadAdmin();
 }else{
   showMemberPage('order-page');
 }
}
async function loadMemberPage(pageId){
 const s=await api('/member/summary');
 if(pageId==='orders-page'){
   $('#orders').innerHTML=table(s.orders.map(x=>({...x,charge:money(x.charge)})),[['id','ID'],['platform','Platform'],['service_name','Layanan'],['quantity','Jumlah'],['charge','Biaya'],['status','Status']]);
 }
 if(pageId==='deposit-page'){
   $('#deposits').innerHTML=table(s.deposits.map(x=>({...x,amount:money(x.amount)})),[['id','ID'],['amount','Nominal'],['status','Status'],['payment_url','Link pembayaran'],['created_at','Tanggal']]);
 }
}
function showMemberPage(pageId){
 if(pageId==='profile-page'){
   $('#profile-avatar').textContent=(currentUser.name||'M').trim().charAt(0).toUpperCase();
   $('#profile-name').textContent=currentUser.name;
   $('#profile-email').textContent=currentUser.email;
   $('#profile-id').textContent=currentUser.id;
   $('#profile-balance').textContent=money(currentUser.balance);
   const form=$('#member-account');
   form.elements.name.value=currentUser.name;
   form.elements.email.value=currentUser.email;
 }
 document.querySelectorAll('.member-page').forEach(el=>el.classList.toggle('hidden',el.id!==pageId));
 document.querySelectorAll('.member-tab').forEach(el=>el.classList.toggle('active',el.dataset.page===pageId));
 if(pageId==='deposit-page')loadPaymentInfo().then(()=>loadMemberPage(pageId)).catch(e=>toast(e.message));
 if(pageId==='orders-page')loadMemberPage(pageId).catch(e=>toast(e.message));
}
document.querySelectorAll('.member-tab').forEach(btn=>btn.addEventListener('click',()=>showMemberPage(btn.dataset.page)));
$('#service-select').addEventListener('change',renderSelectedServiceInfo);

$('#profile-menu-toggle').addEventListener('click',()=>{const d=$('#profile-dropdown');const opening=d.classList.contains('hidden');d.classList.toggle('hidden',!opening);$('#profile-menu-toggle').setAttribute('aria-expanded',String(opening));});
document.querySelectorAll('[data-member-page]').forEach(btn=>btn.addEventListener('click',()=>{showMemberPage(btn.dataset.memberPage);$('#profile-dropdown').classList.add('hidden');$('#profile-menu-toggle').setAttribute('aria-expanded','false');}));
$('#menu-logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST'});location.reload()}catch(e){toast(e.message)}});
document.addEventListener('click',e=>{if(!e.target.closest('#member-profile-menu')){$('#profile-dropdown').classList.add('hidden');$('#profile-menu-toggle').setAttribute('aria-expanded','false')}});
document.querySelectorAll('[data-go-page]').forEach(btn=>btn.addEventListener('click',()=>showMemberPage(btn.dataset.goPage)));
$('#member-account').addEventListener('submit',async e=>{
 e.preventDefault();
 const f=Object.fromEntries(new FormData(e.target));
 try{
   const d=await api('/member/account',{method:'PUT',body:JSON.stringify(f)});
   currentUser=d.user;
   e.target.elements.current_password.value='';
   e.target.elements.new_password.value='';
   $('#welcome').textContent=`Halo, ${currentUser.name} · ${currentUser.email}`;
   toast('Pengaturan akun berhasil diperbarui');
   showMemberPage('profile-page');
 }catch(x){toast(x.message)}
});
async function loadAdmin(){await loadAdminSettings();const d=await api('/admin/overview');$('#admin-stats').innerHTML=[['Member',d.members],['Total order',d.orders],['Deposit pending',d.pending_deposits],['Gross sales',money(d.gross_sales)]].map(x=>`<div class="stat"><b>${x[1]}</b><span class="muted">${x[0]}</span></div>`).join('');const u=await api('/admin/users');$('#users').innerHTML=table(u.users,[['id','ID'],['name','Nama'],['email','Email'],['balance','Saldo'],['role','Role']]);const o=await api('/admin/orders');$('#admin-orders').innerHTML=table(o.orders,[['id','ID'],['email','Member'],['platform','Platform'],['service_name','Layanan'],['charge','Biaya'],['status','Status']]);const dp=await api('/admin/deposits');$('#admin-deposits').innerHTML=dp.deposits.length?'<table><thead><tr><th>ID Deposit / Member</th><th>Nominal</th><th>Bukti / Referensi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+dp.deposits.map(d=>`<tr><td>Deposit #${d.id}<br>Member #${d.member_id} — ${String(d.member_name||'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}<br>${d.email}</td><td>${money(d.amount)}</td><td>${String(d.proof_reference||'—').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}</td><td>${d.status}</td><td>${d.status==='pending'?`<button class="review-deposit" data-id="${d.id}" data-action="approve">Setujui</button> <button class="secondary review-deposit" data-id="${d.id}" data-action="reject">Tolak</button>`:'—'}</td></tr>`).join('')+'</tbody></table>':'<p class="muted">Belum ada deposit.</p>';}
let supplierCatalog=[];
function renderSupplierCatalog(){
 const query=($('#supplier-service-search')?.value||'').trim().toLowerCase();
 const category=$('#supplier-category-filter')?.value||'';
 const rows=supplierCatalog.filter(s=>(!category||s.category===category)&&[s.service_id,s.category,s.name].join(' ').toLowerCase().includes(query));
 $('#supplier-services-list').innerHTML=rows.length?'<table><thead><tr><th>ID</th><th>Kategori</th><th>Nama layanan</th><th>Harga modal / 1.000</th><th>Harga jual otomatis / 1.000</th><th>Min</th><th>Max</th><th>Status</th></tr></thead><tbody>'+rows.map(s=>'<tr><td>'+esc(s.service_id)+'</td><td>'+esc(s.category)+'</td><td>'+esc(s.name)+'</td><td>'+money(s.rate)+'</td><td><b>'+money(Math.ceil(Number(s.rate)*1.75))+'</b></td><td>'+esc(s.min)+'</td><td>'+esc(s.max)+'</td><td><span class="status-active">Aktif untuk member</span></td></tr>').join('')+'</tbody></table>':'<p class="muted">Tidak ada layanan yang cocok dengan pencarian atau kategori ini.</p>';
}
async function loadSupplierCatalog(){
 $('#supplier-catalog-status').textContent='Menghubungi IndoSMM dan menyiapkan semua layanan dengan kenaikan harga 75%…';
 const button=$('#load-supplier-catalog');
 button.disabled=true;
 try{
  const sync=await api('/admin/supplier-services/activate-all',{method:'POST',body:'{}'});
  const d=await api('/admin/supplier-services');
  supplierCatalog=Array.isArray(d.services)?d.services:[];
  const categories=[...new Set(supplierCatalog.map(s=>s.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  const previous=$('#supplier-category-filter').value;
  $('#supplier-category-filter').innerHTML='<option value="">Semua kategori</option>'+categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  if(categories.includes(previous))$('#supplier-category-filter').value=previous;
  $('#supplier-catalog-status').textContent='Selesai: '+sync.activated+' layanan diaktifkan, '+sync.skipped+' dilewati. Harga jual otomatis = modal +75%.';
  renderSupplierCatalog();
  await loadServices();
  toast('Berhasil menyiapkan '+sync.activated+' layanan. Semua layanan valid sudah aktif untuk member.');
 }catch(e){
  $('#supplier-catalog-status').textContent='Gagal menyiapkan katalog: '+e.message;
  $('#supplier-services-list').innerHTML='<p class="muted">Periksa koneksi server dan konfigurasi API supplier di .env.</p>';
  throw e;
 }finally{
  button.disabled=false;
 }
}
$('#load-supplier-catalog').addEventListener('click',()=>loadSupplierCatalog().catch(e=>toast(e.message)));
$('#supplier-service-search').addEventListener('input',renderSupplierCatalog);
$('#supplier-category-filter').addEventListener('change',renderSupplierCatalog);
async function loadAdminSettings(){const d=await api('/admin/settings');const s=d.settings||{};$('#setting-account-name').value=s.sea_bank_account_name||'';$('#setting-account-number').value=s.sea_bank_account_number||'';$('#setting-whatsapp').value=s.admin_whatsapp_number||'';$('#admin-email').value=currentUser.email;}
function showAdminPage(pageId){
 document.querySelectorAll('.admin-page').forEach(el=>el.classList.toggle('hidden',el.id!==pageId));
 document.querySelectorAll('.admin-nav').forEach(el=>el.classList.toggle('active',el.dataset.adminPage===pageId));
}
document.querySelectorAll('.admin-nav').forEach(btn=>btn.addEventListener('click',()=>showAdminPage(btn.dataset.adminPage)));
$('#admin-settings').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));await api('/admin/settings',{method:'PUT',body:JSON.stringify(f)});toast('Pengaturan pembayaran disimpan');await loadPaymentInfo()}catch(x){toast(x.message)}});
$('#admin-account').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));const d=await api('/admin/account',{method:'PUT',body:JSON.stringify(f)});currentUser=d.user;$('#welcome').textContent=`Halo, ${currentUser.name} · ${currentUser.email}`;e.target.password.value='';toast('Akun admin diperbarui')}catch(x){toast(x.message)}});
$('#toggle-login-password').addEventListener('click',()=>{
 const input=$('#login-password');
 const visible=input.type==='password';
 input.type=visible?'text':'password';
 const button=$('#toggle-login-password');
 button.textContent=visible?'Sembunyikan password':'Lihat password';
 button.setAttribute('aria-pressed',String(visible));
});
$('#toggle-register-password').addEventListener('click',()=>{
 const input=$('#register-password');
 const visible=input.type==='password';
 input.type=visible?'text':'password';
 const button=$('#toggle-register-password');
 button.textContent=visible?'Sembunyikan password':'Lihat password';
 button.setAttribute('aria-pressed',String(visible));
});
$('#login').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});await refresh();toast('Berhasil login')}catch(x){toast(x.message)}});
$('#register').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('/auth/register',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});await api('/auth/logout',{method:'POST'});e.target.reset();currentUser=null;location.hash='login';renderAuthRoute();toast('Registrasi berhasil. Silakan login dengan akun baru.')}catch(x){toast(x.message)}});

$('#logout-admin').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST'});location.reload()}catch(x){toast(x.message)}});
$('#deposit').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.amount=Number(f.amount);const d=await api('/deposits',{method:'POST',body:JSON.stringify(f)});e.target.reset();if(d.whatsapp_url){toast('Membuka WhatsApp admin…');window.location.assign(d.whatsapp_url);return}toast(d.message);await refresh();showMemberPage('deposit-page')}catch(x){toast(x.message)}});
let orderMode='single';
document.querySelectorAll('[data-order-mode]').forEach(btn=>btn.addEventListener('click',()=>{orderMode=btn.dataset.orderMode;document.querySelectorAll('[data-order-mode]').forEach(x=>x.classList.toggle('active',x===btn));$('#single-target-label').classList.toggle('hidden',orderMode!=='single');$('#bulk-target-label').classList.toggle('hidden',orderMode!=='bulk');$('#single-target').required=orderMode==='single';$('#bulk-targets').required=orderMode==='bulk';$('#order-mode-help').textContent=orderMode==='single'?'Pesanan biasa: satu link untuk satu pesanan.':'Pesanan massal: satu layanan dan jumlah yang sama dikirim ke banyak link sekaligus (maksimal 50 link).'}));
$('#order').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);const payload=Object.fromEntries(f);const bulk=orderMode==='bulk';const d=await api(bulk?'/orders/bulk':'/orders',{method:'POST',body:JSON.stringify(bulk?{service_id:payload.service_id,quantity:Number(payload.quantity),targets:payload.targets}:{service_id:payload.service_id,quantity:payload.quantity,target:payload.target})});toast(bulk?`Pesanan massal: ${d.count} link · Total ${money(d.charge)} · Berhasil dikirim ${d.success}`:`Order #${d.order_id} tercatat · ${money(d.charge)}`);await refresh()}catch(x){toast(x.message)}});

$('#new-service').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.rate=Number(f.rate);f.supplier_rate=Number(f.supplier_rate);await api('/admin/services',{method:'POST',body:JSON.stringify(f)});toast('Layanan ditambahkan');await loadServices();await loadAdmin()}catch(x){toast(x.message)}});
$('#admin-deposits').addEventListener('click',async e=>{const b=e.target.closest('.review-deposit');if(!b)return;const note=b.dataset.action==='reject'?(prompt('Alasan penolakan (opsional):')||'') : '';try{await api(`/admin/deposits/${b.dataset.id}/review`,{method:'PATCH',body:JSON.stringify({action:b.dataset.action,note})});toast(b.dataset.action==='approve'?'Deposit disetujui, saldo member bertambah.':'Deposit ditolak.');await refresh()}catch(x){toast(x.message)}});
$('#sync').addEventListener('click',async()=>{try{const d=await api('/admin/sync-supplier',{method:'POST',body:'{}'});toast(d.message);await loadServices();await loadSupplierCatalog()}catch(x){toast(x.message)}});

function renderAuthRoute(){
 if(currentUser)return;
 const route=location.hash;
 const isLogin=route==='#login';
 const isRegister=route==='#register';
 document.body.classList.toggle('auth-view',isLogin||isRegister);
 $('#auth-entry').classList.toggle('hidden',!(isLogin||isRegister));
 $('#login').classList.toggle('hidden',!isLogin);
 $('#register').classList.toggle('hidden',!isRegister);
 $('#auth-title').textContent=isLogin?'Masuk ke akun':'Daftar member baru';
}
window.addEventListener('hashchange',renderAuthRoute);

loadPaymentInfo().catch(()=>{});loadServices().then(()=>refresh().catch(()=>renderAuthRoute())).catch(e=>toast(e.message));