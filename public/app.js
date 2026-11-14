const $=s=>document.querySelector(s);const money=n=>'Rp'+Number(n||0).toLocaleString('id-ID');let currentUser=null;let catalog=[];
async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Permintaan gagal');return d}
function toast(msg){const el=$('#message');el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',4200)}
function table(rows,cols){if(!rows?.length)return '<p class="muted">Belum ada data.</p>';return '<table><thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+cols.map(c=>`<td>${String(row[c[0]]??'—').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</td>`).join('')+'</tr>').join('')+'</tbody></table>'}
async function loadPaymentInfo(){const d=await api('/payment-info');$('#bank-info').innerHTML=`<b>${d.bank}</b><br>Atas nama: ${d.account_name}<br>No. rekening: <b>${d.account_number}</b><br><small>${d.instructions}</small>`}
async function loadServices(){const d=await api('/services');catalog=d.services;$('#services').innerHTML=catalog.length?catalog.map(s=>`<div class="service"><b>${s.platform} — ${s.name}</b><small>${money(s.rate)} / 1.000 · Min ${s.min_qty} · Maks ${s.max_qty}</small></div>`).join(''):'<p class="muted">Katalog belum diisi admin.</p>';$('#service-select').innerHTML=catalog.map(s=>`<option value="${s.id}">${s.platform} — ${s.name} (${money(s.rate)}/1k)</option>`).join('')}
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
   await loadAdmin();
 }else{
   showMemberPage('profile-page');
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
async function loadAdmin(){await loadAdminSettings();const d=await api('/admin/overview');$('#admin-stats').innerHTML=[['Member',d.members],['Total order',d.orders],['Deposit pending',d.pending_deposits],['Gross sales',money(d.gross_sales)]].map(x=>`<div class="stat"><b>${x[1]}</b><span class="muted">${x[0]}</span></div>`).join('');const u=await api('/admin/users');$('#users').innerHTML=table(u.users,[['id','ID'],['name','Nama'],['email','Email'],['balance','Saldo'],['role','Role']]);const o=await api('/admin/orders');$('#admin-orders').innerHTML=table(o.orders,[['id','ID'],['email','Member'],['platform','Platform'],['service_name','Layanan'],['charge','Biaya'],['status','Status']]);const dp=await api('/admin/deposits');$('#admin-deposits').innerHTML=dp.deposits.length?'<table><thead><tr><th>ID Deposit / Member</th><th>Nominal</th><th>Bukti / Referensi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+dp.deposits.map(d=>`<tr><td>Deposit #${d.id}<br>Member #${d.member_id} — ${String(d.member_name||'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}<br>${d.email}</td><td>${money(d.amount)}</td><td>${String(d.proof_reference||'—').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}</td><td>${d.status}</td><td>${d.status==='pending'?`<button class="review-deposit" data-id="${d.id}" data-action="approve">Setujui</button> <button class="secondary review-deposit" data-id="${d.id}" data-action="reject">Tolak</button>`:'—'}</td></tr>`).join('')+'</tbody></table>':'<p class="muted">Belum ada deposit.</p>';await loadAdminServices()}
async function loadAdminSettings(){const d=await api('/admin/settings');const s=d.settings||{};$('#setting-account-name').value=s.sea_bank_account_name||'';$('#setting-account-number').value=s.sea_bank_account_number||'';$('#setting-whatsapp').value=s.admin_whatsapp_number||'';$('#admin-email').value=currentUser.email;}
async function loadAdminServices(){const d=await api('/admin/services');const esc=v=>String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));$('#admin-services').innerHTML=d.services.length?'<table><thead><tr><th>Layanan</th><th>Modal / 1.000</th><th>Harga jual / 1.000</th><th>Selisih</th><th>Aksi</th></tr></thead><tbody>'+d.services.map(s=>`<tr><td>${esc(s.platform)} — ${esc(s.name)}<br><small>ID ${esc(s.supplier_service_id||'-')}</small></td><td>${money(s.supplier_rate)}</td><td><input class="admin-sell-price" type="number" min="0" step="1" value="${Number(s.rate)}" data-id="${s.id}" style="width:120px"></td><td>${money(Number(s.rate)-Number(s.supplier_rate))}</td><td><button class="save-service-price" data-id="${s.id}">Simpan</button></td></tr>`).join('')+'</tbody></table>':'<p class="muted">Belum ada layanan.</p>'}
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
$('#logout').addEventListener('click',async()=>{await api('/auth/logout',{method:'POST'});location.reload()});
$('#logout-admin').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST'});location.reload()}catch(x){toast(x.message)}});
$('#deposit').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.amount=Number(f.amount);const d=await api('/deposits',{method:'POST',body:JSON.stringify(f)});e.target.reset();if(d.whatsapp_url){toast('Membuka WhatsApp admin…');window.location.assign(d.whatsapp_url);return}toast(d.message);await refresh();showMemberPage('deposit-page')}catch(x){toast(x.message)}});
$('#order').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);const d=await api('/orders',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});toast(`Order #${d.order_id} tercatat · ${money(d.charge)}`);await refresh()}catch(x){toast(x.message)}});
$('#new-service').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.rate=Number(f.rate);f.supplier_rate=Number(f.supplier_rate);await api('/admin/services',{method:'POST',body:JSON.stringify(f)});toast('Layanan ditambahkan');await loadServices();await loadAdmin()}catch(x){toast(x.message)}});
$('#admin-deposits').addEventListener('click',async e=>{const b=e.target.closest('.review-deposit');if(!b)return;const note=b.dataset.action==='reject'?(prompt('Alasan penolakan (opsional):')||'') : '';try{await api(`/admin/deposits/${b.dataset.id}/review`,{method:'PATCH',body:JSON.stringify({action:b.dataset.action,note})});toast(b.dataset.action==='approve'?'Deposit disetujui, saldo member bertambah.':'Deposit ditolak.');await refresh()}catch(x){toast(x.message)}});
$('#admin-services').addEventListener('click',async e=>{const b=e.target.closest('.save-service-price');if(!b)return;const input=$(`#admin-services .admin-sell-price[data-id="${b.dataset.id}"]`);try{await api(`/admin/services/${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({rate:Number(input.value)})});toast('Harga jual berhasil disimpan');await loadAdminServices();await loadServices()}catch(x){toast(x.message)}});
$('#sync').addEventListener('click',async()=>{try{const d=await api('/admin/sync-supplier',{method:'POST',body:'{}'});toast(d.message);await loadServices();await loadAdminServices()}catch(x){toast(x.message)}});

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