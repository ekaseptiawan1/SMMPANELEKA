const $=s=>document.querySelector(s);const money=n=>'Rp'+Number(n||0).toLocaleString('id-ID');let currentUser=null;let catalog=[];
async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Permintaan gagal');return d}
function toast(msg){const el=$('#message');el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',4200)}
function table(rows,cols){if(!rows?.length)return '<p class="muted">Belum ada data.</p>';return '<table><thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+cols.map(c=>`<td>${String(row[c[0]]??'—').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</td>`).join('')+'</tr>').join('')+'</tbody></table>'}
async function loadPaymentInfo(){const d=await api('/payment-info');$('#bank-info').innerHTML=`<b>${d.bank}</b><br>Atas nama: ${d.account_name}<br>No. rekening: <b>${d.account_number}</b><br><small>${d.instructions}</small>`}
function esc(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}
function orderServiceType(service){
 const raw=String(service?.service_type||'Default').toLowerCase();
 if(raw.includes('subscription'))return 'subscriptions';
 if(raw.includes('custom')&&raw.includes('comment')&&raw.includes('package'))return 'custom_comments_package';
 if(raw.includes('custom')&&raw.includes('comment'))return 'custom_comments';
 if(raw.includes('mention')&&raw.includes('custom')&&raw.includes('list'))return 'mentions_custom_list';
 if(raw.includes('mention'))return 'mentions';
 if(raw.includes('poll'))return 'poll';
 if(raw.includes('package'))return 'package';
 if(raw.includes('default')||raw.includes('drip'))return 'default';
 return 'unsupported';
}
function renderOrderPriceSummary(){
 const s=catalog.find(x=>String(x.id)===String($('#service-select').value));
 const quantityEl=$('#order-quantity');
 const summary=$('#order-price-summary');
 if(!summary)return;
 if(!s){summary.classList.add('hidden');return;}
 const type=orderServiceType(s);
 let quantity=0;
 if(type==='package')quantity=1;
 else if(type==='custom_comments'||type==='custom_comments_package')quantity=String($('#order-comments').value||'').split(/[\\r\\n]+/).filter(x=>x.trim()).length;
 else if(type==='mentions')quantity=Number(quantityEl.value||0);
 else if(type==='mentions_custom_list')quantity=String($('#order-usernames').value||'').split(/[\\r\\n,]+/).filter(x=>x.trim()).length;
 else if(type==='subscriptions')quantity=Number($('#subscription-min').value||0)*Number($('#subscription-posts').value||1);
 else quantity=Number(quantityEl.value||0);
 const isPackage=['package','custom_comments_package'].includes(type);
 let total=isPackage?Math.ceil(Number(s.rate)||0):Math.ceil((Number(s.rate)||0)*quantity/1000);
 if(orderMode==='bulk'&&type==='default'){
  const count=String($('#bulk-targets').value||'').split(/[\\r\\n]+/).filter(x=>x.trim()).length;
  total*=count;
 }
 $('#order-price-quantity').textContent=quantity.toLocaleString('id-ID')+(orderMode==='bulk'&&type==='default'?' × link':'');
 $('#order-price-value').textContent=money(total);
 summary.classList.remove('hidden');
}
function renderSelectedServiceInfo(){
 const s=catalog.find(x=>String(x.id)===String($('#service-select').value));
 const el=$('#selected-service-info'),qty=$('#order-quantity');
 const type=orderServiceType(s);
 const isSubscription=type==='subscriptions';
 const isBulk=orderMode==='bulk'&&type==='default';
 $('#package-fields').classList.toggle('hidden',type!=='package');
 $('#custom-comments-fields').classList.toggle('hidden',!['custom_comments','custom_comments_package'].includes(type));
 $('#mentions-fields').classList.toggle('hidden',!['mentions','mentions_custom_list'].includes(type));
 $('#poll-fields').classList.toggle('hidden',type!=='poll');
 $('#subscription-username-label').classList.toggle('hidden',!isSubscription);
 $('#subscription-fields').classList.toggle('hidden',!isSubscription);
 $('#quantity-label').classList.toggle('hidden',!['default','poll','mentions'].includes(type));
 $('#single-target-label').classList.toggle('hidden',isSubscription||isBulk);
 $('#bulk-target-label').classList.toggle('hidden',!isBulk);
 $('#subscription-username').required=isSubscription;
 $('#subscription-min').required=isSubscription;
 $('#subscription-max').required=isSubscription;
 $('#order-comments').required=['custom_comments','custom_comments_package'].includes(type);
 $('#order-usernames').required=['mentions','mentions_custom_list'].includes(type);
 $('#poll-answer-number').required=type==='poll';
 $('#single-target').required=!isSubscription&&!isBulk;
 $('#bulk-targets').required=isBulk;
 qty.required=['default','poll','mentions'].includes(type);
 qty.disabled=!qty.required;
 const bulkButton=document.querySelector('[data-order-mode="bulk"]');
 bulkButton.disabled=Boolean(s&&type!=='default');
 $('#submit-order').disabled=Boolean(s&&type==='unsupported');
 if(s&&type!=='default'&&orderMode==='bulk'){
   orderMode='single';
   document.querySelectorAll('[data-order-mode]').forEach(x=>x.classList.toggle('active',x.dataset.orderMode==='single'));
 }
 renderOrderPriceSummary();
 if(!el)return;
 if(!s){
   $('#submit-order').disabled=true;
   el.textContent='Pilih layanan terlebih dahulu.';
   $('#selected-service-description').innerHTML='<b>Deskripsi layanan</b>';
   if(qty){qty.removeAttribute('max');qty.min='1'}
   return;
 }
 if(qty&&['default','poll','mentions'].includes(type)){
   qty.min=String(s.min_qty||1);qty.removeAttribute('max');
   const current=Number(qty.value||0);
   if(current<Number(s.min_qty||1))qty.value=s.min_qty;
   const quantityLabel=$('#quantity-label');
   if(quantityLabel&&quantityLabel.firstChild)quantityLabel.firstChild.textContent='Jumlah (minimal: '+s.min_qty+') ';
 }
 if(isSubscription){
   $('#subscription-min').min=String(s.min_qty||1);
   $('#subscription-min').removeAttribute('max');
   $('#subscription-max').min=String(s.min_qty||1);
   $('#subscription-max').removeAttribute('max');
   $('#subscription-min').value=s.min_qty;
   $('#subscription-max').value=s.min_qty;
 }
 const typeLabel={default:'Default',package:'Package',custom_comments:'Custom Comments',custom_comments_package:'Custom Comments Package',mentions:'Mentions',mentions_custom_list:'Mentions Custom List',poll:'Poll',subscriptions:'Subscriptions',unsupported:'Belum didukung'}[type];
 $('#selected-service-description').innerHTML='<b>Deskripsi layanan</b><br>'+esc(s.description||'Deskripsi layanan dari supplier belum tersedia.');
 el.innerHTML='<b>'+esc(s.platform)+' · '+esc(s.name)+'</b><br>Jenis: <b>'+typeLabel+'</b>'+(type==='unsupported'?'<br>Tipe ini belum didukung sehingga tombol pesanan dinonaktifkan.':'')+'<br>Harga: <b>'+money(s.rate)+'</b>'+(['package','custom_comments_package'].includes(type)?' per paket':' per 1.000')+'<br>Jumlah minimal: <b>'+esc(s.min_qty)+'</b> · Maksimal order: <b>'+esc(s.max_qty)+'</b><br>'+(s.delay_enabled?('Delay layanan: '+esc(s.delay_value)+' '+(s.delay_unit==='minutes'?'menit':'detik')+'<br>'):'')+(s.processing_time&& !/mengikuti antrean supplier/i.test(s.processing_time)?'<br>Estimasi proses: '+esc(s.processing_time):'');
 renderOrderPriceSummary();
}
function renderOrderServiceOptions(){const category=$('#service-category').value;const select=$('#service-select');const previous=select.value;const items=catalog.filter(s=>(s.platform||'Lainnya')===category);select.innerHTML='<option value="">Pilih layanan...</option>'+items.map(s=>'<option value="'+s.id+'">'+esc(s.name)+' — '+money(s.rate)+'/1k</option>').join('');select.disabled=!category||!items.length;if(items.some(s=>String(s.id)===previous))select.value=previous;renderSelectedServiceInfo()}
async function loadServices(){const d=await api('/services');catalog=d.services;$('#services').innerHTML=catalog.length?catalog.map(s=>'<div class="service"><b>'+esc(s.platform)+' — '+esc(s.name)+'</b><p>'+esc(s.description||'Deskripsi layanan belum tersedia.')+'</p><small>'+money(s.rate)+' / 1.000 · Jumlah minimal '+s.min_qty+' · Maksimal order '+s.max_qty+'</small>'+(s.processing_time&& !/mengikuti antrean supplier/i.test(s.processing_time)?'<small>Estimasi proses: '+esc(s.processing_time)+'</small>':'')+'</div>').join(''):'<p class="muted">Katalog belum diisi admin.</p>';const categorySelect=$('#service-category');const previousCategory=categorySelect.value;const categories=[...new Set(catalog.map(s=>s.platform||'Lainnya'))].sort((a,b)=>a.localeCompare(b,'id'));categorySelect.innerHTML='<option value="">Pilih kategori...</option>'+categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');if(categories.includes(previousCategory))categorySelect.value=previousCategory;else categorySelect.value='';renderOrderServiceOptions()}
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
$('#service-category').addEventListener('change',()=>{const category=$('#service-category').value;const select=$('#service-select');select.innerHTML='<option value="">Pilih layanan...</option>';select.disabled=!category;renderOrderServiceOptions()});
$('#service-select').addEventListener('change',renderSelectedServiceInfo);
$('#subscription-min').addEventListener('input',()=>{$('#subscription-max').value=$('#subscription-min').value;});

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
$('#users').addEventListener('click',async e=>{const button=e.target.closest('.delete-admin-member');if(!button)return;const memberName=button.dataset.name||'member ini';if(!confirm('Hapus akun '+memberName+'? Penghapusan hanya bisa dilakukan jika saldo nol dan tidak memiliki riwayat transaksi/pesanan.'))return;try{const result=await api('/admin/users/'+encodeURIComponent(button.dataset.id),{method:'DELETE'});toast(result.message||'Member berhasil dihapus.');await loadAdmin()}catch(x){toast(x.message)}});
async function loadAdmin(){await loadAdminSettings();const d=await api('/admin/overview');$('#admin-stats').innerHTML=[['Member',d.members],['Total order',d.orders],['Deposit pending',d.pending_deposits],['Gross sales',money(d.gross_sales)]].map(x=>`<div class="stat"><b>${x[1]}</b><span class="muted">${x[0]}</span></div>`).join('');const u=await api('/admin/users');$('#users').innerHTML=u.users.length?'<table><thead><tr><th>ID</th><th>Nama</th><th>Email</th><th>Saldo</th><th>Role</th><th>Aksi</th></tr></thead><tbody>'+u.users.map(x=>'<tr><td>'+esc(x.id)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.email)+'</td><td>'+money(x.balance)+'</td><td>'+esc(x.role)+'</td><td>'+(x.role==='member'?'<button type="button" class="secondary delete-admin-member" data-id="'+esc(x.id)+'" data-name="'+esc(x.name)+'">Hapus</button>':'<span class="muted">Dilindungi</span>')+'</td></tr>').join('')+'</tbody></table>':'<p class="muted">Belum ada member.</p>';const o=await api('/admin/orders');$('#admin-orders').innerHTML=o.orders.length?'<table><thead><tr><th>ID</th><th>Member</th><th>Platform</th><th>Layanan</th><th>Biaya</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+o.orders.map(x=>'<tr><td>#'+esc(x.id)+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.platform)+'</td><td>'+esc(x.service_name)+'</td><td>'+money(x.charge)+'</td><td>'+esc(x.status)+'</td><td><button type="button" class="secondary delete-admin-order" data-id="'+esc(x.id)+'">Hapus</button></td></tr>').join('')+'</tbody></table>':'<p class="muted">Belum ada pesanan.</p>';const dp=await api('/admin/deposits');$('#admin-deposits').innerHTML=dp.deposits.length?'<table><thead><tr><th>ID Deposit / Member</th><th>Nominal</th><th>Bukti / Referensi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+dp.deposits.map(d=>`<tr data-deposit-id="${esc(d.id)}" data-member-id="${esc(d.member_id)}"><td>Deposit #${d.id}<br>Member #${d.member_id} — ${String(d.member_name||'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}<br>${d.email}</td><td>${money(d.amount)}</td><td>${String(d.proof_reference||'—').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]))}</td><td>${d.status}</td><td>${d.status==='pending'?`<button class="review-deposit" data-id="${d.id}" data-action="approve">Setujui</button> <button class="secondary review-deposit" data-id="${d.id}" data-action="reject">Tolak</button> `:''}${d.status==='paid'?'<small class="muted">Deposit lunas dilindungi</small>':'<button type="button" class="secondary delete-admin-deposit" data-id="'+esc(d.id)+'">Hapus</button>'}</td></tr>`).join('')+'</tbody></table>':'<p class="muted">Belum ada deposit.</p>';}
let activeServices=[];
function renderActiveServices(){
 const query=($('#active-service-search').value||'').trim().toLowerCase();
 const category=$('#active-service-category').value||'';
 const rows=activeServices.filter(s=>(!category||s.platform===category)&&[s.id,s.supplier_service_id,s.platform,s.service_type,s.name].join(' ').toLowerCase().includes(query));
 $('#active-services-list').innerHTML=rows.length?'<table><thead><tr><th>ID</th><th>ID Supplier</th><th>Kategori</th><th>Tipe</th><th>Nama layanan</th><th>Modal supplier</th><th>Harga jual member</th><th>Min</th><th>Max</th><th>Delay</th><th>Estimasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+rows.map(s=>'<tr><td>'+esc(s.id)+'</td><td>'+esc(s.supplier_service_id||'—')+'</td><td>'+esc(s.platform)+'</td><td>'+esc(s.service_type||'Default')+'</td><td>'+esc(s.name)+'</td><td>'+money(s.supplier_rate)+'</td><td><b>'+money(s.rate)+'</b></td><td>'+esc(s.min_qty)+'</td><td>'+esc(s.max_qty)+'</td><td>'+(s.delay_enabled?esc(s.delay_value)+' '+(s.delay_unit==='minutes'?'menit':'detik'):'Nonaktif')+'</td><td>'+esc(s.processing_time||'Belum diatur')+'</td><td>'+(s.active?'<span class="status-active">Aktif</span>':'Nonaktif')+'</td><td><button type="button" class="edit-active-service" data-id="'+esc(s.id)+'">Edit</button></td></tr>').join('')+'</tbody></table>':'<p class="muted">Belum ada layanan aktif yang cocok dengan pencarian.</p>';
}
async function loadAllServices(){
 $('#active-services-list').innerHTML='<p class="muted">Memuat daftar layanan aktif…</p>';
 const d=await api('/admin/services');
 activeServices=Array.isArray(d.services)?d.services:[];
 const categories=[...new Set(activeServices.map(s=>s.platform).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
 const previous=$('#active-service-category').value;
 $('#active-service-category').innerHTML='<option value="">Semua kategori</option>'+categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
 if(categories.includes(previous))$('#active-service-category').value=previous;
 renderActiveServices();
}
async function loadSupplierCatalog(){
 const button=$('#load-supplier-catalog');
 button.disabled=true;
 $('#supplier-catalog-status').textContent='Menghubungi IndoSMM dan mengaktifkan layanan valid dengan harga jual awal +75%…';
 try{
  const sync=await api('/admin/supplier-services/activate-all',{method:'POST',body:'{}'});
  $('#supplier-catalog-status').textContent='Selesai: '+sync.activated+' layanan aktif, '+sync.skipped+' dilewati. Harga jual awal dihitung modal +75%. Edit harga dan detail di halaman Semua Layanan Aktif.';
  await loadServices();
  await loadAllServices();
  toast('Berhasil mengaktifkan '+sync.activated+' layanan.');
 }catch(e){
  $('#supplier-catalog-status').textContent='Gagal memuat katalog: '+e.message;
  throw e;
 }finally{button.disabled=false}
}
$('#load-supplier-catalog').addEventListener('click',()=>loadSupplierCatalog().catch(e=>toast(e.message)));
$('#sync').addEventListener('click',async()=>{
 const b=$('#sync');b.disabled=true;
 try{const d=await api('/admin/sync-supplier',{method:'POST',body:'{}'});$('#supplier-catalog-status').textContent=d.message;toast(d.message);await loadAllServices();}
 catch(e){toast(e.message)}
 finally{b.disabled=false}
});
$('#active-service-search').addEventListener('input',renderActiveServices);
$('#active-service-category').addEventListener('change',renderActiveServices);
$('#active-services-list').addEventListener('click',e=>{
 const b=e.target.closest('.edit-active-service');if(!b)return;
 const s=activeServices.find(x=>String(x.id)===b.dataset.id);if(!s)return;
 const f=$('#edit-service-form');f.classList.remove('hidden');
 for(const key of ['id','supplier_service_id','platform','service_type','name','description','supplier_rate','rate','min_qty','max_qty','processing_time','delay_value','delay_unit'])f.elements[key].value=s[key]??(key==='delay_value'?1:'');
 f.elements.delay_enabled.checked=Boolean(s.delay_enabled);f.elements.active.checked=Boolean(s.active);toggleDelayFields();
 f.scrollIntoView({behavior:'smooth',block:'start'});
});
function toggleDelayFields(){const f=$('#edit-service-form');const enabled=f.elements.delay_enabled.checked;f.querySelector('.delay-fields').classList.toggle('hidden',!enabled);f.elements.delay_value.disabled=!enabled;f.elements.delay_unit.disabled=!enabled;f.elements.delay_value.required=enabled;}
$('#edit-delay-enabled').addEventListener('change',toggleDelayFields);
$('#cancel-edit-service').addEventListener('click',()=>$('#edit-service-form').classList.add('hidden'));
$('#edit-service-form').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.currentTarget;const data=Object.fromEntries(new FormData(f));
 data.supplier_rate=Number(data.supplier_rate);data.rate=Number(data.rate);data.min_qty=Number(data.min_qty);data.max_qty=Number(data.max_qty);data.active=f.elements.active.checked;data.delay_enabled=f.elements.delay_enabled.checked;data.delay_value=Number(data.delay_value||1);data.delay_unit=data.delay_unit||'seconds';
 try{await api('/admin/services/'+encodeURIComponent(data.id),{method:'PATCH',body:JSON.stringify(data)});toast('Perubahan layanan berhasil disimpan.');f.classList.add('hidden');await loadAllServices();await loadServices();}
 catch(err){toast(err.message)}
});
async function loadAdminSettings(){const d=await api('/admin/settings');const s=d.settings||{};$('#setting-account-name').value=s.sea_bank_account_name||'';$('#setting-account-number').value=s.sea_bank_account_number||'';$('#setting-whatsapp').value=s.admin_whatsapp_number||'';$('#admin-email').value=currentUser.email;}
function showAdminPage(pageId){
 document.querySelectorAll('.admin-page').forEach(el=>el.classList.toggle('hidden',el.id!==pageId));
 document.querySelectorAll('.admin-nav').forEach(el=>el.classList.toggle('active',el.dataset.adminPage===pageId));
}
document.querySelectorAll('.admin-nav').forEach(btn=>btn.addEventListener('click',()=>{showAdminPage(btn.dataset.adminPage);if(btn.dataset.adminPage==='admin-all-services-page')loadAllServices().catch(e=>toast(e.message));}));
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
$('#register').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));const d=await api('/auth/register',{method:'POST',body:JSON.stringify(f)});$('#verify-email').elements.email.value=d.email||f.email;$('#verify-email').elements.code.value='';e.target.reset();location.hash='verify-email';renderAuthRoute();toast(d.message||'Periksa Gmail untuk kode verifikasi.')}catch(x){toast(x.message);if(x.message.includes('email belum berhasil dikirim')){const f=new FormData(e.target);$('#verify-email').elements.email.value=f.get('email');location.hash='verify-email';renderAuthRoute();}}});
$('#verify-email').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));await api('/auth/verify-email',{method:'POST',body:JSON.stringify(f)});e.target.elements.code.value='';location.hash='login';renderAuthRoute();toast('Email berhasil diverifikasi. Silakan login.')}catch(x){toast(x.message)}});
$('#resend-verification').addEventListener('click',async()=>{const email=$('#verify-email').elements.email.value.trim();try{const d=await api('/auth/resend-verification',{method:'POST',body:JSON.stringify({email})});toast(d.message)}catch(x){toast(x.message)}});
$('#logout-admin').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST'});location.reload()}catch(x){toast(x.message)}});
$('#deposit').addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));f.amount=Number(f.amount);const d=await api('/deposits',{method:'POST',body:JSON.stringify(f)});e.target.reset();if(d.whatsapp_url){toast('Membuka WhatsApp admin…');window.location.assign(d.whatsapp_url);return}toast(d.message);await refresh();showMemberPage('deposit-page')}catch(x){toast(x.message)}});
['order-quantity','order-comments','order-usernames','subscription-min','subscription-posts','bulk-targets'].forEach(id=>{const el=$('#'+id);if(el)el.addEventListener('input',renderOrderPriceSummary)});
let orderMode='single';
document.querySelectorAll('[data-order-mode]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.disabled)return;orderMode=btn.dataset.orderMode;document.querySelectorAll('[data-order-mode]').forEach(x=>x.classList.toggle('active',x===btn));renderSelectedServiceInfo();$('#order-mode-help').textContent=orderMode==='single'?'Pesanan biasa: satu link untuk satu pesanan.':'Pesanan massal: satu layanan dan jumlah yang sama dikirim ke banyak link sekaligus (maksimal 50 link).'}));
$('#order').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.target);const p=Object.fromEntries(f);const selected=catalog.find(x=>String(x.id)===String(p.service_id));const type=orderServiceType(selected);if(type==='subscriptions')p.max=p.min;const bulk=orderMode==='bulk'&&type==='default';
let requestedQuantity=null;
if(bulk||['default','poll','mentions'].includes(type))requestedQuantity=Number(p.quantity);
else if(type==='custom_comments')requestedQuantity=String(p.comments||'').split(/[\\r\\n]+/).filter(x=>x.trim()).length;
else if(type==='mentions_custom_list')requestedQuantity=String(p.usernames||'').split(/[\\r\\n,]+/).filter(x=>x.trim()).length;
if(requestedQuantity!==null&&selected&&requestedQuantity>Number(selected.max_qty)){toast('Jumlah maksimal layanan ini adalah '+selected.max_qty+'. Silakan masukkan jumlah sesuai batas maksimal.');return;}
if(type==='subscriptions'&&selected&&(Number(p.min)<Number(selected.min_qty)||Number(p.min)>Number(selected.max_qty))){toast('Peringatan: jumlah yang dimasukkan melebihi jumlah maksimal layanan ('+selected.max_qty+'). Batas minimal layanan adalah '+selected.min_qty+'.');return;}
let body={service_id:p.service_id};if(bulk){body={...body,quantity:Number(p.quantity),targets:p.targets}}else if(type==='subscriptions'){body={...body,username:p.username,min:Number(p.min),max:Number(p.max),posts:Number(p.posts||1),old_posts:$('#subscription-old-posts').checked,delay:Number(p.delay||0),expiry:p.expiry||''}}else if(type==='package'){body={...body,target:p.target}}else if(type==='custom_comments'||type==='custom_comments_package'){body={...body,target:p.target,comments:p.comments}}else if(type==='mentions'){body={...body,target:p.target,quantity:Number(p.quantity),usernames:p.usernames}}else if(type==='mentions_custom_list'){body={...body,target:p.target,usernames:p.usernames}}else if(type==='poll'){body={...body,target:p.target,quantity:Number(p.quantity),answer_number:Number(p.answer_number)}}else{body={...body,target:p.target,quantity:Number(p.quantity)}}const d=await api(bulk?'/orders/bulk':'/orders',{method:'POST',body:JSON.stringify(body)});toast(bulk?`Pesanan massal: ${d.count} link · Total ${money(d.charge)} · Berhasil dikirim ${d.success}`:`Order #${d.order_id} tercatat · ${money(d.charge)}`);e.target.reset();orderMode='single';document.querySelectorAll('[data-order-mode]').forEach(x=>x.classList.toggle('active',x.dataset.orderMode==='single'));await loadServices();await refresh()}catch(x){toast(x.message)}});

$('#admin-orders').addEventListener('click',async e=>{const b=e.target.closest('.delete-admin-order');if(!b)return;if(!confirm('Hapus catatan pesanan #'+b.dataset.id+'? Pesanan di supplier tidak dibatalkan dan saldo member tidak dikembalikan.'))return;try{await api('/admin/orders/'+encodeURIComponent(b.dataset.id),{method:'DELETE'});toast('Catatan pesanan berhasil dihapus.');await refresh()}catch(x){toast(x.message)}});
$('#admin-deposit-search').addEventListener('input',()=>{const q=$('#admin-deposit-search').value.trim().toLowerCase();$('#admin-deposits').querySelectorAll('tbody tr').forEach(row=>{const depositId=String(row.dataset.depositId||'').toLowerCase();row.hidden=!!q&&!depositId.includes(q);});});
$('#admin-deposits').addEventListener('click',async e=>{const del=e.target.closest('.delete-admin-deposit');if(del){if(!confirm('Hapus data deposit #'+del.dataset.id+'? Saldo member tidak berubah. Deposit lunas tidak dapat dihapus.'))return;try{await api('/admin/deposits/'+encodeURIComponent(del.dataset.id),{method:'DELETE'});toast('Data deposit berhasil dihapus.');await refresh()}catch(x){toast(x.message)}return;}});
$('#admin-deposits').addEventListener('click',async e=>{const b=e.target.closest('.review-deposit');if(!b)return;const note=b.dataset.action==='reject'?(prompt('Alasan penolakan (opsional):')||'') : '';try{await api(`/admin/deposits/${b.dataset.id}/review`,{method:'PATCH',body:JSON.stringify({action:b.dataset.action,note})});toast(b.dataset.action==='approve'?'Deposit disetujui, saldo member bertambah.':'Deposit ditolak.');await refresh()}catch(x){toast(x.message)}});

function renderAuthRoute(){
 const route=location.hash;
 const isLogin=route==='#login';
 const isRegister=route==='#register';
 const isVerify=route==='#verify-email';
 const isAuthRoute=isLogin||isRegister||isVerify;
 if(currentUser&&!isAuthRoute)return;
 document.body.classList.toggle('auth-view',isAuthRoute);
 if(isAuthRoute){
  document.body.classList.remove('authenticated','admin-view');
  $('#dashboard').classList.add('hidden');
  $('#admin').classList.add('hidden');
 }
 $('#auth-entry').classList.toggle('hidden',!isAuthRoute);
 $('#login').classList.toggle('hidden',!isLogin);
 $('#register').classList.toggle('hidden',!isRegister);
 $('#verify-email').classList.toggle('hidden',!isVerify);
 $('#auth-title').textContent=isLogin?'Masuk ke akun':isVerify?'Verifikasi email':'Daftar member baru';
}
window.addEventListener('hashchange',renderAuthRoute);

loadPaymentInfo().catch(()=>{});loadServices().then(()=>refresh().catch(()=>renderAuthRoute())).catch(e=>toast(e.message));