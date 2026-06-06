// ============================================================
//  FAITHTRADE — SUPABASE INTEGRATION
//  faithtrade-supabase.js
// ============================================================

// ---- CONFIG ----
const SUPA_URL = 'https://bfvrayjrfrgufszvpxqj.supabase.co';
const SUPA_KEY = 'sb_publishable_I0w4Y-gV8EJ7ET6O6AGrrg_7RYe3xog';
const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

// ---- LOCAL STATE ----
let DB = { currentUser: null, cart: [], products: [] };
let activeCat = 'all', searchQ = '', activeChatThread = null;
let editingProductId = null, currentImgData = null;
let editingOrderId = null, cancelingOrderId = null, deletingProductId = null;

// ============================================================
//  MAPPERS  (Supabase row → app object)
// ============================================================
function mapProduct(r) {
  return {
    id: r.id, name: r.name, emoji: r.emoji || '📦',
    image: r.image || null, price: parseFloat(r.price),
    category: r.category, country: r.country,
    desc: r.description, seller: r.seller, sellerId: r.seller_id
  };
}
function mapOrder(r) {
  return {
    id: r.id, buyerId: r.buyer_id, buyerName: r.buyer_name,
    buyerEmail: r.buyer_email, buyerPhone: r.buyer_phone,
    buyerAddress: r.buyer_address, buyerCountry: r.buyer_country,
    payment: r.payment, sellerId: r.seller_id, sellerName: r.seller_name,
    productId: r.product_id, productName: r.product_name,
    productEmoji: r.product_emoji || '📦',
    qty: r.qty, unitPrice: parseFloat(r.unit_price),
    amount: parseFloat(r.amount), status: r.status,
    date: r.date, placedAt: r.placed_at
  };
}
function mapUser(r) {
  return {
    id: r.id, role: r.role, name: r.name, email: r.email,
    password: r.password, country: r.country, currency: r.currency,
    category: r.category, joined: r.joined
  };
}

// ============================================================
//  UTILITIES
// ============================================================
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show';
  el.style.borderLeftColor = type === 'e' ? '#C0392B' : 'var(--teal-light)';
  setTimeout(() => el.classList.remove('show'), 3000);
}

function showLoading(id, msg = 'Loading...') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="es"><div class="es-icon">⏳</div><h4>${msg}</h4></div>`;
}

function prodImg(p, size) {
  if (p && p.image) {
    return `<img src="${p.image}" alt="${p.name}" style="width:100%;height:${size}px;object-fit:cover;">`;
  }
  return `<div style="width:100%;height:${size}px;background:linear-gradient(135deg,#E8F5F3,#C8E8E4);display:flex;align-items:center;justify-content:center;font-size:${size > 80 ? 48 : 22}px">${(p && p.emoji) || '📦'}</div>`;
}

function orderTimeLeft(o) {
  if (!o.placedAt) return { ok: false, label: 'Expired' };
  const left = (5 * 60 * 60 * 1000) - (Date.now() - o.placedAt);
  if (left <= 0) return { ok: false, label: 'Window closed' };
  return { ok: true, label: `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m left` };
}

// ============================================================
//  AUTH FLOW
// ============================================================
function goAuth(role) {
  document.getElementById('role-select').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  renderAuth(role, false);
  const titles = {
    buyer:  ['Shop Globally,<br>Trade Faithfully', "Join thousands of buyers and sellers on FaithTrade's trusted international marketplace."],
    seller: ['Grow Your<br>Business Globally', 'List products, manage orders and reach buyers worldwide on FaithTrade.'],
    admin:  ['Admin<br>Command Center', 'Restricted access — authorised personnel only. Full platform visibility and control.']
  };
  const t = titles[role];
  document.getElementById('ar-title').innerHTML = t[0];
  document.getElementById('ar-desc').textContent = t[1];
}

function renderAuth(role, isReg) {
  const box = document.getElementById('auth-box');
  let extra = '';
  if (isReg && role === 'buyer') {
    extra = `<label class="lbl">Country</label>
      <select class="inp" id="r-country"><option>Ghana</option><option>Nigeria</option><option>Kenya</option><option>South Africa</option><option>United States</option><option>United Kingdom</option><option>Germany</option><option>Canada</option><option>India</option><option>Other</option></select>
      <label class="lbl">Currency</label>
      <select class="inp" id="r-cur"><option>USD</option><option>EUR</option><option>GBP</option><option>GHS</option><option>NGN</option><option>KES</option></select>`;
  }
  if (isReg && role === 'seller') {
    extra = `<label class="lbl">Country of Operation</label>
      <select class="inp" id="r-country"><option>Ghana</option><option>Nigeria</option><option>Kenya</option><option>South Africa</option><option>Morocco</option><option>United States</option><option>United Kingdom</option><option>Germany</option><option>India</option><option>China</option></select>
      <label class="lbl">Business Category</label>
      <select class="inp" id="r-cat"><option>General Merchandise</option><option>Fashion &amp; Apparel</option><option>Food &amp; Agriculture</option><option>Crafts &amp; Art</option><option>Electronics</option><option>Health &amp; Beauty</option></select>`;
  }
  const adminBadge = role === 'admin'
    ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:100px;background:rgba(23,79,68,0.08);border:1.5px solid rgba(23,79,68,0.2);color:var(--teal-darker);font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:20px">🔐 Restricted Access</div><br>` : '';

  box.innerHTML = `
    ${adminBadge}
    <div class="auth-title">${isReg ? 'Create Account' : 'Welcome Back!'}</div>
    <div class="auth-sub">${isReg ? 'Join FaithTrade as a ' + role.charAt(0).toUpperCase() + role.slice(1) : 'Log Into Your Account'}</div>
    ${isReg ? `<label class="lbl">${role === 'seller' ? 'Business Name' : 'Full Name'}</label><input class="inp" id="r-name" placeholder="Enter ${role === 'seller' ? 'business name' : 'full name'}...">` : ''}
    <label class="lbl">Email</label><input class="inp" id="a-email" type="email" placeholder="Enter email...">
    <label class="lbl">Password</label><input class="inp" id="a-pass" type="password" placeholder="Enter password...">
    ${extra}
    <button class="auth-btn-main" onclick="doAuth('${role}',${isReg})">${isReg ? 'SIGN UP' : 'LOGIN'}</button>
    ${role !== 'admin' ? `<span class="auth-forgot">FORGOT YOUR PASSWORD?</span>
      <div class="auth-sw">${isReg
        ? `Already have an account? <a onclick="renderAuth('${role}',false)">SIGN IN</a>`
        : `Don't Have An Account? <a onclick="renderAuth('${role}',true)">SIGN UP</a>`
      }</div>
      <div class="auth-sw" style="margin-top:16px"><a onclick="backHome()">← Back to Home</a></div>` : ''}
  `;
}

function backHome() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('role-select').style.display = 'flex';
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

async function doAuth(role, isReg) {
  const email = document.getElementById('a-email')?.value?.trim();
  const pass  = document.getElementById('a-pass')?.value?.trim();
  if (!email || !pass) { toast('Please fill all fields', 'e'); return; }

  if (role === 'admin') {
    const { data, error } = await sb.from('users').select('*').eq('role','admin').eq('email', email).eq('password', pass).single();
    if (error || !data) { toast('Invalid admin credentials', 'e'); return; }
    DB.currentUser = mapUser(data);
    showPortal('admin');
    return;
  }

  if (isReg) {
    const { data: existing } = await sb.from('users').select('id').eq('email', email).eq('role', role);
    if (existing && existing.length > 0) { toast('Email already registered for this role', 'e'); return; }
    const name    = document.getElementById('r-name')?.value?.trim() || email.split('@')[0];
    const country = document.getElementById('r-country')?.value || 'Ghana';
    const newUser = {
      id: 'U' + Date.now(), role, email, password: pass, name, country,
      joined:   new Date().toLocaleDateString('en-GB'),
      currency: role === 'buyer'  ? (document.getElementById('r-cur')?.value  || 'USD') : null,
      category: role === 'seller' ? (document.getElementById('r-cat')?.value  || 'General') : null
    };
    const { error } = await sb.from('users').insert([newUser]);
    if (error) { toast('Registration failed: ' + error.message, 'e'); return; }
    DB.currentUser = newUser;
    toast('Welcome to FaithTrade, ' + name + '! 🎉');
    showPortal(role);
  } else {
    const { data, error } = await sb.from('users').select('*').eq('email', email).eq('password', pass).eq('role', role).single();
    if (error || !data) { toast('Invalid credentials', 'e'); return; }
    DB.currentUser = mapUser(data);
    toast('Welcome back, ' + DB.currentUser.name + '!');
    showPortal(role);
  }
}

async function showPortal(role) {
  ['role-select','auth-screen','buyer-portal','seller-portal','admin-portal']
    .forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById(role + '-portal').style.display = 'block';

  const { data: prods } = await sb.from('products').select('*');
  DB.products = (prods || []).map(mapProduct);

  if (role === 'buyer')  await initBuyer();
  if (role === 'seller') await initSeller();
  if (role === 'admin')  await initAdmin();
}

async function logout() {
  DB.currentUser = null; DB.cart = []; updCart();
  ['buyer-portal','seller-portal','admin-portal'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('role-select').style.display = 'flex';
  toast('Signed out');
}

// ============================================================
//  BUYER
// ============================================================
async function initBuyer() {
  const u = DB.currentUser;
  document.getElementById('b-ava').textContent   = u.name[0].toUpperCase();
  document.getElementById('b-uname').textContent = u.name;
  document.getElementById('b-hname').textContent = u.name;
  renderHomePg(); renderBrowsePg(); updCart();
}

function bNav(page, btn) {
  document.querySelectorAll('#buyer-portal .ni').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['home','browse','orders','messages','feed'].forEach(p => {
    const e = document.getElementById('b-' + p); if (e) e.classList.remove('on');
  });
  document.getElementById('b-' + page)?.classList.add('on');
  const ic = { home:'🏠', browse:'🔍', orders:'📦', messages:'💬', feed:'📰' };
  const tt = { home:'Home', browse:'Browse Library', orders:'My Orders', messages:'Messages', feed:'Community Feed' };
  document.getElementById('b-ticon').textContent  = ic[page];
  document.getElementById('b-ttitle').textContent = tt[page];
  if (page === 'orders')   renderBuyerOrders();
  if (page === 'messages') renderBuyerChatThreads();
}

function renderHomePg() {
  document.getElementById('home-pg').innerHTML = DB.products.slice(0, 6).map(ptHTML).join('');
}

function ptHTML(p) {
  return `<div class="pt">
    <div class="pt-img" style="height:140px;overflow:hidden">${prodImg(p, 140)}</div>
    <div class="pt-body">
      <div class="pt-country">📍 ${p.country}</div>
      <div class="pt-name">${p.name}</div>
      <div class="pt-seller">by ${p.seller}</div>
      <div class="pt-foot">
        <div class="pt-price">$${p.price.toFixed(2)}</div>
        <button class="atc" onclick="addToCart('${p.id}')">ADD</button>
      </div>
    </div>
  </div>`;
}

function renderBrowsePg() {
  let ps = DB.products;
  if (activeCat !== 'all') ps = ps.filter(p => p.category === activeCat);
  if (searchQ) ps = ps.filter(p =>
    p.name.toLowerCase().includes(searchQ) || (p.desc || '').toLowerCase().includes(searchQ)
  );
  const g = document.getElementById('browse-pg');
  g.innerHTML = ps.length
    ? ps.map(ptHTML).join('')
    : '<div class="es"><div class="es-icon">🔍</div><h4>No products found</h4><p>Try a different search or filter.</p></div>';
}

function fCat(cat, btn) {
  activeCat = cat;
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderBrowsePg();
}

function searchProd(q) { searchQ = q.toLowerCase(); renderBrowsePg(); }

// ---- CART ----
function addToCart(id) {
  const p = DB.products.find(p => p.id === id); if (!p) return;
  const ex = DB.cart.find(c => c.id === id);
  ex ? ex.qty++ : DB.cart.push({ ...p, qty: 1 });
  updCart(); toast(p.name + ' added ✓');
}

function updCart() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = DB.cart.reduce((s, c) => s + c.qty, 0);
}

function openCart() {
  const items = document.getElementById('cart-items');
  if (!DB.cart.length) {
    items.innerHTML = '<div class="es"><div class="es-icon">🛒</div><h4>Cart is empty</h4><p>Add products from the marketplace.</p></div>';
    document.getElementById('cart-total').textContent = '$0.00';
  } else {
    items.innerHTML = DB.cart.map(c =>
      `<div class="ci">
        <div class="ci-thumb" style="overflow:hidden">${prodImg(c, 46)}</div>
        <div><div class="ci-name">${c.name}</div><div class="ci-price">$${c.price.toFixed(2)} × ${c.qty}</div></div>
        <button class="ci-rm" onclick="rmCart('${c.id}')">✕</button>
      </div>`
    ).join('');
    document.getElementById('cart-total').textContent =
      '$' + DB.cart.reduce((s, c) => s + c.price * c.qty, 0).toFixed(2);
  }
  document.getElementById('cart-modal').classList.add('open');
}

function closeCart() { document.getElementById('cart-modal').classList.remove('open'); }
function rmCart(id) { DB.cart = DB.cart.filter(c => c.id !== id); updCart(); openCart(); }

function openCheckout() {
  if (!DB.cart.length) { toast('Cart is empty', 'e'); return; }
  closeCart();
  const u = DB.currentUser;
  document.getElementById('co-name').value  = u?.name  || '';
  document.getElementById('co-email').value = u?.email || '';
  document.getElementById('checkout-modal').classList.add('open');
}
function closeCheckout() { document.getElementById('checkout-modal').classList.remove('open'); }

async function placeOrder() {
  const g   = id => document.getElementById(id).value.trim();
  const name    = g('co-name'), email = g('co-email');
  const phone   = document.getElementById('co-phone').value.trim() || 'N/A';
  const addr    = g('co-addr'), city  = g('co-city');
  const country = document.getElementById('co-country').value;
  const pay     = document.getElementById('co-pay').value;
  if (!name || !email || !addr || !city) { toast('Please fill all shipping details', 'e'); return; }

  const now = Date.now();
  const newOrders = DB.cart.map(item => ({
    id: 'FT-' + String(now + Math.random()).replace('.','').slice(-8),
    buyer_id: DB.currentUser.id, buyer_name: name, buyer_email: email,
    buyer_phone: phone, buyer_address: addr + ', ' + city, buyer_country: country,
    payment: pay, seller_id: item.sellerId || null, seller_name: item.seller,
    product_id: item.id, product_name: item.name, product_emoji: item.emoji || '📦',
    qty: item.qty, unit_price: item.price, amount: item.price * item.qty,
    status: 'pending', date: new Date().toLocaleDateString('en-GB'), placed_at: now
  }));

  const { error } = await sb.from('orders').insert(newOrders);
  if (error) { toast('Order failed: ' + error.message, 'e'); return; }

  DB.cart = []; updCart(); closeCheckout();
  toast('Order placed successfully! 🎉');
  bNav('orders', document.querySelectorAll('#buyer-portal .ni')[2]);
}

// ---- BUYER ORDERS ----
async function renderBuyerOrders() {
  showLoading('b-orders-list', 'Loading orders...');
  const { data, error } = await sb.from('orders').select('*')
    .eq('buyer_id', DB.currentUser.id).order('placed_at', { ascending: false });
  if (error) { toast('Failed to load orders', 'e'); return; }
  const list = document.getElementById('b-orders-list');
  if (!data || !data.length) {
    list.innerHTML = '<div class="es"><div class="es-icon">📦</div><h4>No orders yet</h4><p>Browse and place your first order.</p></div>';
    return;
  }
  const orders = data.map(mapOrder);
  list.innerHTML = orders.map(o => {
    const p  = DB.products.find(x => x.id === o.productId);
    const tw = orderTimeLeft(o);
    const canAct    = o.status === 'pending' && tw.ok;
    const isCancelled = o.status === 'cancelled';
    const timerHtml = o.status === 'pending'
      ? `<span class="timer-tag ${tw.ok ? '' : 'expired'}">⏱ ${tw.label}</span>` : '';
    const actBtns = canAct
      ? `<button class="oact-btn oact-edit"   onclick="openEditOrder('${o.id}')">✏️ Edit</button>
         <button class="oact-btn oact-cancel" onclick="openCancelOrder('${o.id}')">✕ Cancel</button>`
      : (o.status === 'pending' && !tw.ok ? '<span class="timer-tag expired">Window closed</span>' : '');
    const msgBtn = !isCancelled
      ? `<button class="oact-btn oact-msg" onclick="openChatWithSeller('${o.sellerId || ''}','${o.sellerName}')">💬 Message</button>` : '';
    return `<div class="lr" style="flex-wrap:wrap;gap:10px;align-items:flex-start;padding:14px 10px">
      <div class="lthumb" style="overflow:hidden;flex-shrink:0">${p ? prodImg(p,46) : `<span style="font-size:20px">${o.productEmoji}</span>`}</div>
      <div class="linfo" style="min-width:180px">
        <div class="ltitle">${o.productName}</div>
        <div class="lsub">${o.id} · ${o.date} · from ${o.sellerName}</div>
        <div class="lsub" style="margin-top:2px">Qty: ${o.qty} · ${timerHtml}</div>
      </div>
      <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
      <div class="lprice">$${o.amount.toFixed(2)}</div>
      <div class="order-actions">${actBtns}${msgBtn}</div>
    </div>`;
  }).join('');
}

// ============================================================
//  SELLER
// ============================================================
async function initSeller() {
  const u = DB.currentUser;
  document.getElementById('s-ava').textContent   = u.name[0].toUpperCase();
  document.getElementById('s-uname').textContent = u.name;
  document.getElementById('s-hname').textContent = u.name;
  await refreshSellerDash();
}

function sNav(page, btn) {
  document.querySelectorAll('#seller-portal .ni').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['home','products','orders','messages','feed'].forEach(p => {
    const e = document.getElementById('s-' + p); if (e) e.classList.remove('on');
  });
  document.getElementById('s-' + page)?.classList.add('on');
  const ic = { home:'🏠', products:'📦', orders:'🧾', messages:'💬', feed:'📰' };
  const tt = { home:'Home', products:'My Products', orders:'Orders', messages:'Messages', feed:'Community Feed' };
  document.getElementById('s-ticon').textContent  = ic[page];
  document.getElementById('s-ttitle').textContent = tt[page];
  if (page === 'home')     refreshSellerDash();
  if (page === 'products') renderSellerProds();
  if (page === 'orders')   renderSellerOrds();
  if (page === 'messages') renderSellerChatThreads();
}

async function refreshSellerDash() {
  const u = DB.currentUser;
  const { data: myOrders } = await sb.from('orders').select('*').eq('seller_id', u.id);
  const myO    = (myOrders || []).map(mapOrder);
  const myProds = DB.products.filter(p => p.sellerId === u.id);
  document.getElementById('s-rev').textContent   = '$' + myO.reduce((s,o) => s + o.amount, 0).toFixed(2);
  document.getElementById('s-ords').textContent  = myO.length;
  document.getElementById('s-lists').textContent = myProds.length;
  const el = document.getElementById('s-recent');
  if (!myO.length) {
    el.innerHTML = '<div class="es"><div class="es-icon">📭</div><h4>No orders yet</h4><p>Buyers will appear here once they purchase.</p></div>';
    return;
  }
  el.innerHTML = myO.slice(0, 5).map(o => {
    const p = DB.products.find(x => x.id === o.productId);
    return `<div class="lr">
      <div class="lthumb" style="overflow:hidden">${p ? prodImg(p,46) : `<span style="font-size:20px">📦</span>`}</div>
      <div class="linfo"><div class="ltitle">${o.buyerName} — ${o.productName}</div><div class="lsub">${o.id} · ${o.date} · ${o.buyerCountry}</div></div>
      <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
      <div class="lprice">$${o.amount.toFixed(2)}</div><div class="larrow">›</div>
    </div>`;
  }).join('');
}

function sellerProdRowHTML(p) {
  return `<div class="lr">
    <div class="lthumb" style="overflow:hidden">${prodImg(p, 46)}</div>
    <div class="linfo"><div class="ltitle">${p.name}</div><div class="lsub">${p.desc || ''} · ${p.country}</div></div>
    <span class="bdg live">Live</span>
    <div class="lprice">$${p.price.toFixed(2)}</div>
    <div class="prod-actions">
      <button class="edit-btn" onclick="openEditProd('${p.id}')">✏️ Edit</button>
      <button class="del-btn"  onclick="openDelModal('${p.id}')">🗑️ Delete</button>
    </div>
  </div>`;
}

function renderSellerProds() {
  const pr = DB.products.filter(p => p.sellerId === DB.currentUser.id);
  const el = document.getElementById('s-prod-list');
  el.innerHTML = pr.length
    ? pr.map(sellerProdRowHTML).join('')
    : '<div class="es"><div class="es-icon">📦</div><h4>No products yet</h4><p>Add your first product to start selling.</p></div>';
}

async function renderSellerOrds() {
  showLoading('s-ord-list', 'Loading orders...');
  const { data } = await sb.from('orders').select('*')
    .eq('seller_id', DB.currentUser.id).order('placed_at', { ascending: false });
  const my = (data || []).map(mapOrder);
  const el = document.getElementById('s-ord-list');
  if (!my.length) { el.innerHTML = '<div class="es"><div class="es-icon">📭</div><h4>No orders yet</h4></div>'; return; }
  el.innerHTML = my.map(o => `
    <div class="lr">
      <div class="lthumb">${o.productEmoji}</div>
      <div class="linfo">
        <div class="ltitle">${o.buyerName} ordered ${o.productName} ×${o.qty}</div>
        <div class="lsub">${o.id} · ${o.date} · Ships to ${o.buyerCountry}</div>
      </div>
      <select style="padding:6px 10px;border:1.5px solid var(--border-mid);border-radius:8px;font-family:Nunito,sans-serif;font-size:11px;font-weight:700;color:var(--teal-dark);cursor:pointer;outline:none;background:white;"
        onchange="updStatus('${o.id}',this.value)">
        <option ${o.status==='pending'?'selected':''} value="pending">Pending</option>
        <option ${o.status==='processing'?'selected':''} value="processing">Processing</option>
        <option ${o.status==='shipped'?'selected':''} value="shipped">Shipped</option>
        <option ${o.status==='delivered'?'selected':''} value="delivered">Delivered</option>
      </select>
      <div class="lprice">$${o.amount.toFixed(2)}</div>
    </div>`).join('');
}

async function updStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) { toast('Update failed', 'e'); return; }
  toast('Order ' + id + ' → ' + status);
}

// ---- ADD / EDIT / DELETE PRODUCT ----
function openAddProd() {
  editingProductId = null; currentImgData = null;
  document.getElementById('ap-modal-title').textContent   = '📦 Add Product';
  document.getElementById('ap-modal-sub').textContent     = 'List a new product on FaithTrade';
  document.getElementById('ap-submit-btn').textContent    = 'List Product →';
  ['ap-name','ap-price','ap-desc','ap-country'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('ap-cat').selectedIndex = 0;
  resetImgUpload();
  document.getElementById('ap-modal').classList.add('open');
}

function openEditProd(id) {
  const p = DB.products.find(p => p.id === id); if (!p) return;
  editingProductId = id; currentImgData = p.image || null;
  document.getElementById('ap-modal-title').textContent   = '✏️ Edit Product';
  document.getElementById('ap-modal-sub').textContent     = 'Update your product details';
  document.getElementById('ap-submit-btn').textContent    = 'Save Changes →';
  document.getElementById('ap-name').value    = p.name;
  document.getElementById('ap-price').value   = p.price;
  document.getElementById('ap-desc').value    = p.desc || '';
  document.getElementById('ap-country').value = p.country;
  document.getElementById('ap-cat').value     = p.category;
  if (p.image) {
    document.getElementById('ap-img-preview').src          = p.image;
    document.getElementById('ap-img-preview').style.display = 'block';
    document.getElementById('ap-img-placeholder').style.display = 'none';
    document.getElementById('ap-img-box').classList.add('has-img');
  } else { resetImgUpload(); }
  document.getElementById('ap-modal').classList.add('open');
}

function closeAddProd() {
  document.getElementById('ap-modal').classList.remove('open');
  editingProductId = null; currentImgData = null;
}

function resetImgUpload() {
  document.getElementById('ap-img-preview').src            = '';
  document.getElementById('ap-img-preview').style.display  = 'none';
  document.getElementById('ap-img-placeholder').style.display = 'flex';
  document.getElementById('ap-img-box').classList.remove('has-img');
  document.getElementById('ap-img-input').value = '';
  currentImgData = null;
}

function handleImgUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Image too large — max 5MB', 'e'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    currentImgData = e.target.result;
    document.getElementById('ap-img-preview').src           = currentImgData;
    document.getElementById('ap-img-preview').style.display  = 'block';
    document.getElementById('ap-img-placeholder').style.display = 'none';
    document.getElementById('ap-img-box').classList.add('has-img');
  };
  reader.readAsDataURL(file);
}

async function submitProduct() {
  const g       = id => document.getElementById(id).value.trim();
  const name    = g('ap-name');
  const cat     = document.getElementById('ap-cat').value;
  const price   = parseFloat(document.getElementById('ap-price').value);
  const desc    = g('ap-desc');
  const country = g('ap-country');
  if (!name || !price || !desc || !country) { toast('Fill all product fields', 'e'); return; }
  const u = DB.currentUser;

  if (editingProductId) {
    const updates = { name, category: cat, price, description: desc, country };
    if (currentImgData) updates.image = currentImgData;
    const { error } = await sb.from('products').update(updates).eq('id', editingProductId);
    if (error) { toast('Update failed: ' + error.message, 'e'); return; }
    const p = DB.products.find(p => p.id === editingProductId);
    if (p) { p.name = name; p.category = cat; p.price = price; p.desc = desc; p.country = country; if (currentImgData) p.image = currentImgData; }
    toast(name + ' updated! ✓');
  } else {
    const newProd = {
      id: 'P' + Date.now(), name, image: currentImgData || null,
      emoji: '📦', price, category: cat, country,
      description: desc, seller: u.name, seller_id: u.id
    };
    const { error } = await sb.from('products').insert([newProd]);
    if (error) { toast('Failed to list product: ' + error.message, 'e'); return; }
    DB.products.push(mapProduct(newProd));
    toast(name + ' listed! ✓');
  }
  closeAddProd();
  renderSellerProds(); renderHomePg(); renderBrowsePg();
}

function openDelModal(id) {
  deletingProductId = id;
  const p = DB.products.find(p => p.id === id);
  document.getElementById('del-prod-name').textContent = p ? p.name : 'this product';
  document.getElementById('del-modal').classList.add('open');
}
function closeDelModal() { document.getElementById('del-modal').classList.remove('open'); deletingProductId = null; }

async function confirmDelete() {
  if (!deletingProductId) return;
  const p = DB.products.find(p => p.id === deletingProductId);
  const { error } = await sb.from('products').delete().eq('id', deletingProductId);
  if (error) { toast('Delete failed: ' + error.message, 'e'); return; }
  DB.products = DB.products.filter(p => p.id !== deletingProductId);
  closeDelModal(); renderSellerProds(); renderHomePg(); renderBrowsePg(); refreshSellerDash();
  toast((p ? p.name : 'Product') + ' deleted');
}

// ---- ORDER EDIT / CANCEL ----
async function openEditOrder(id) {
  const { data } = await sb.from('orders').select('*').eq('id', id).single();
  if (!data) return;
  const o  = mapOrder(data);
  const tw = orderTimeLeft(o);
  if (!tw.ok) { toast('Edit window has closed (5-hour limit)', 'e'); return; }
  editingOrderId = id;
  const p = DB.products.find(x => x.id === o.productId);
  document.getElementById('edit-order-sub').textContent        = 'Change quantity · ' + tw.label + ' remaining';
  document.getElementById('edit-order-name').textContent       = o.productName;
  document.getElementById('edit-order-price-info').textContent = '$' + o.unitPrice.toFixed(2) + ' each';
  document.getElementById('edit-order-img').innerHTML          = p ? prodImg(p, 48) : `<span style="font-size:22px">${o.productEmoji}</span>`;
  document.getElementById('edit-order-qty').value              = o.qty;
  document.getElementById('edit-order-new-total').textContent  = '$' + o.amount.toFixed(2);
  document.getElementById('edit-order-modal').classList.add('open');
}

function adjQty(delta) {
  const el = document.getElementById('edit-order-qty');
  el.value = Math.max(1, Math.min(99, (parseInt(el.value) || 1) + delta));
  updateEditTotal();
}

async function updateEditTotal() {
  if (!editingOrderId) return;
  const { data } = await sb.from('orders').select('unit_price').eq('id', editingOrderId).single();
  if (!data) return;
  const qty = parseInt(document.getElementById('edit-order-qty').value) || 1;
  document.getElementById('edit-order-new-total').textContent = '$' + (parseFloat(data.unit_price) * qty).toFixed(2);
}

async function saveOrderEdit() {
  const { data } = await sb.from('orders').select('*').eq('id', editingOrderId).single();
  if (!data) return;
  const o  = mapOrder(data);
  const tw = orderTimeLeft(o);
  if (!tw.ok) { toast('Edit window has closed', 'e'); closeEditOrder(); return; }
  const qty       = parseInt(document.getElementById('edit-order-qty').value) || 1;
  const newAmount = o.unitPrice * qty;
  const { error } = await sb.from('orders').update({ qty, amount: newAmount }).eq('id', editingOrderId);
  if (error) { toast('Update failed', 'e'); return; }
  closeEditOrder(); renderBuyerOrders(); toast('Order updated to qty ' + qty + ' ✓');
}

function closeEditOrder() { document.getElementById('edit-order-modal').classList.remove('open'); editingOrderId = null; }

async function openCancelOrder(id) {
  const { data } = await sb.from('orders').select('placed_at,status').eq('id', id).single();
  if (!data) return;
  const tw = orderTimeLeft({ placedAt: data.placed_at });
  if (!tw.ok) { toast('Cancel window has closed (5-hour limit)', 'e'); return; }
  cancelingOrderId = id;
  document.getElementById('cancel-order-id').textContent = id;
  document.getElementById('cancel-order-modal').classList.add('open');
}
function closeCancelOrder() { document.getElementById('cancel-order-modal').classList.remove('open'); cancelingOrderId = null; }

async function confirmCancelOrder() {
  const { error } = await sb.from('orders').update({ status: 'cancelled' }).eq('id', cancelingOrderId);
  if (error) { toast('Cancel failed', 'e'); return; }
  closeCancelOrder(); renderBuyerOrders(); toast('Order ' + cancelingOrderId + ' cancelled');
}

// ============================================================
//  MESSAGING
// ============================================================
async function getOrCreateThread(buyerId, buyerName, sellerId, sellerName) {
  const { data: existing } = await sb.from('threads').select('*').eq('buyer_id', buyerId).eq('seller_id', sellerId);
  if (existing && existing.length > 0) return existing[0];
  const newThread = { id: 'T' + Date.now(), buyer_id: buyerId, buyer_name: buyerName, seller_id: sellerId, seller_name: sellerName };
  const { data } = await sb.from('threads').insert([newThread]).select().single();
  return data;
}

async function openChatWithSeller(sellerId, sellerName) {
  if (!sellerId) { toast('Seller info unavailable', 'e'); return; }
  const u = DB.currentUser;
  const t = await getOrCreateThread(u.id, u.name, sellerId, sellerName);
  if (!t) { toast('Could not open chat', 'e'); return; }
  activeChatThread = t.id;
  bNav('messages', document.querySelectorAll('#buyer-portal .ni')[3]);
  setTimeout(() => { renderBuyerChatThreads(); openThread('buyer', t.id); }, 150);
}

async function renderBuyerChatThreads() {
  const { data: threads } = await sb.from('threads').select('*').eq('buyer_id', DB.currentUser.id);
  const el = document.getElementById('b-chat-threads'); if (!el) return;
  if (!threads || !threads.length) {
    el.innerHTML = '<div class="chat-empty-threads">No conversations yet.<br>Message a seller from your orders.</div>';
    return;
  }
  el.innerHTML = threads.map(t => `
    <div class="chat-thread ${activeChatThread === t.id ? 'active' : ''}" onclick="openThread('buyer','${t.id}')">
      <div class="chat-thread-ava">${t.seller_name[0].toUpperCase()}</div>
      <div class="chat-thread-info">
        <div class="chat-thread-name">${t.seller_name}</div>
        <div class="chat-thread-preview">Tap to open conversation</div>
      </div>
    </div>`).join('');
}

async function renderSellerChatThreads() {
  const { data: threads } = await sb.from('threads').select('*').eq('seller_id', DB.currentUser.id);
  const el = document.getElementById('s-chat-threads'); if (!el) return;
  if (!threads || !threads.length) {
    el.innerHTML = '<div class="chat-empty-threads">No conversations yet.<br>Buyers can message you from their orders.</div>';
    return;
  }
  el.innerHTML = threads.map(t => `
    <div class="chat-thread ${activeChatThread === t.id ? 'active' : ''}" onclick="openThread('seller','${t.id}')">
      <div class="chat-thread-ava">${t.buyer_name[0].toUpperCase()}</div>
      <div class="chat-thread-info">
        <div class="chat-thread-name">${t.buyer_name}</div>
        <div class="chat-thread-preview">Tap to open conversation</div>
      </div>
    </div>`).join('');
}

async function openThread(role, threadId) {
  activeChatThread = threadId;
  const isB = role === 'buyer';
  const { data: thread } = await sb.from('threads').select('*').eq('id', threadId).single();
  if (!thread) return;
  const pfx = isB ? 'b' : 's';
  document.getElementById(pfx + '-chat-topbar-content').style.display = 'flex';
  document.getElementById(pfx + '-chat-empty-top').style.display       = 'none';
  document.getElementById(pfx + '-chat-input-bar').style.display       = 'flex';
  const otherName = isB ? thread.seller_name : thread.buyer_name;
  document.getElementById(pfx + '-chat-with-name').textContent = otherName;
  document.getElementById(pfx + '-chat-with-sub').textContent  = isB ? 'Merchant' : 'Customer';
  document.getElementById(pfx + '-chat-ava').textContent       = otherName[0].toUpperCase();
  await renderChatMessages(role, threadId);
  if (isB) renderBuyerChatThreads(); else renderSellerChatThreads();
}

async function renderChatMessages(role, threadId) {
  const isB   = role === 'buyer';
  const bodyEl = document.getElementById((isB ? 'b' : 's') + '-chat-body');
  const { data: msgs } = await sb.from('messages').select('*').eq('thread_id', threadId).order('time', { ascending: true });
  if (!msgs || !msgs.length) {
    bodyEl.innerHTML = '<div class="chat-no-sel" style="margin:auto;text-align:center;color:var(--text-muted)"><div style="font-size:28px;margin-bottom:8px">👋</div><div style="font-size:12px">Say hello! Start the conversation.</div></div>';
    return;
  }
  let lastDate = '';
  bodyEl.innerHTML = msgs.map(m => {
    const isOut = (isB && m.from_role === 'buyer') || (!isB && m.from_role === 'seller');
    const d     = new Date(m.time).toLocaleDateString('en-GB');
    const dateDivider = d !== lastDate ? `<div class="chat-date-divider">${d}</div>` : '';
    lastDate = d;
    const timeStr = new Date(m.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${dateDivider}<div class="chat-msg ${isOut ? 'out' : 'in'}">${m.text}<div class="chat-msg-time">${timeStr}</div></div>`;
  }).join('');
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

async function sendMsg(role) {
  const isB  = role === 'buyer';
  const inp  = document.getElementById((isB ? 'b' : 's') + '-chat-msg');
  const text = inp.value.trim();
  if (!text || !activeChatThread) return;
  const { error } = await sb.from('messages').insert([{
    thread_id: activeChatThread, from_role: isB ? 'buyer' : 'seller', text, time: Date.now()
  }]);
  if (error) { toast('Message failed', 'e'); return; }
  inp.value = '';
  await renderChatMessages(role, activeChatThread);
}

// ============================================================
//  ADMIN
// ============================================================
async function initAdmin() { await refreshAdmin(); }

function aNav(page, btn) {
  document.querySelectorAll('#admin-portal .ni').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['overview','orders','products','buyers','sellers'].forEach(p => {
    const e = document.getElementById('a-' + p); if (e) e.classList.remove('on');
  });
  document.getElementById('a-' + page)?.classList.add('on');
  const ic = { overview:'📊', orders:'🧾', products:'📦', buyers:'🛍️', sellers:'🏪' };
  const tt = { overview:'Overview', orders:'All Orders', products:'All Products', buyers:'All Buyers', sellers:'All Sellers' };
  document.getElementById('a-ticon').textContent  = ic[page];
  document.getElementById('a-ttitle').textContent = tt[page];
  refreshAdmin();
}

async function refreshAdmin() {
  const [{ data: allOrders }, { data: allUsers }, { data: allProds }] = await Promise.all([
    sb.from('orders').select('*').order('placed_at', { ascending: false }),
    sb.from('users').select('*'),
    sb.from('products').select('*')
  ]);
  const orders  = (allOrders || []).map(mapOrder);
  const users   = (allUsers  || []).map(mapUser);
  const prods   = (allProds  || []).map(mapProduct);
  const buyers  = users.filter(u => u.role === 'buyer');
  const sellers = users.filter(u => u.role === 'seller');
  const rev     = orders.reduce((s, o) => s + o.amount, 0);

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('a-rev',  '$' + rev.toFixed(2));
  set('a-ords', orders.length);
  set('a-buys', buyers.length);
  set('a-sels', sellers.length);

  const lat = document.getElementById('a-latest');
  if (lat) lat.innerHTML = orders.length
    ? orders.slice(0, 10).map(o =>
        `<div class="lr"><div class="lthumb">${o.productEmoji}</div>
         <div class="linfo"><div class="ltitle">${o.buyerName} → ${o.productName}</div>
         <div class="lsub">${o.id} · ${o.sellerName} · ${o.buyerCountry} · ${o.date}</div></div>
         <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
         <div class="lprice">$${o.amount.toFixed(2)}</div><div class="larrow">›</div></div>`).join('')
    : '<div class="es"><div class="es-icon">🧾</div><h4>No orders yet</h4></div>';

  const tbody = document.getElementById('a-ord-tbody');
  if (tbody) tbody.innerHTML = orders.length
    ? orders.map(o =>
        `<tr><td style="font-weight:700;color:var(--teal-dark)">${o.id}</td><td style="font-weight:700">${o.buyerName}</td>
         <td>${o.buyerEmail}</td><td>${o.buyerPhone}</td><td>${o.productEmoji} ${o.productName}</td>
         <td>${o.qty}</td><td style="font-weight:800;color:var(--teal-dark)">$${o.amount.toFixed(2)}</td>
         <td>${o.buyerCountry}</td><td>${o.buyerAddress}</td><td>${o.payment}</td>
         <td>${o.sellerName}</td><td>${o.date}</td>
         <td><span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></td></tr>`).join('')
    : `<tr><td colspan="13"><div class="es"><div class="es-icon">🧾</div><h4>No orders yet</h4></div></td></tr>`;

  const apl = document.getElementById('a-prod-list');
  if (apl) apl.innerHTML = prods.length
    ? prods.map(p =>
        `<div class="lr"><div class="lthumb">${p.emoji}</div>
         <div class="linfo"><div class="ltitle">${p.name}</div><div class="lsub">${p.seller} · ${p.category} · ${p.country}</div></div>
         <span class="bdg live">${p.category}</span><div class="lprice">$${p.price.toFixed(2)}</div><div class="larrow">›</div></div>`).join('')
    : '<div class="es"><div class="es-icon">📦</div><h4>No products yet</h4></div>';

  const abl = document.getElementById('a-buy-list');
  if (abl) abl.innerHTML = buyers.length
    ? buyers.map(b => {
        const os = orders.filter(o => o.buyerId === b.id);
        return `<div class="lr"><div class="lthumb" style="font-weight:800;font-size:16px;color:var(--teal-dark)">${b.name[0]}</div>
          <div class="linfo"><div class="ltitle">${b.name}</div><div class="lsub">${b.email} · ${b.country||'N/A'} · Joined ${b.joined||'N/A'}</div></div>
          <span class="bdg live">${os.length} orders</span>
          <div class="lprice">$${os.reduce((s,o)=>s+o.amount,0).toFixed(2)}</div><div class="larrow">›</div></div>`;
      }).join('')
    : '<div class="es"><div class="es-icon">🛍️</div><h4>No buyers yet</h4></div>';

  const asl = document.getElementById('a-sel-list');
  if (asl) asl.innerHTML = sellers.length
    ? sellers.map(s => {
        const ps  = prods.filter(p => p.sellerId === s.id).length;
        const os  = orders.filter(o => o.sellerId === s.id);
        return `<div class="lr"><div class="lthumb" style="font-weight:800;font-size:16px;color:var(--teal-dark)">${s.name[0]}</div>
          <div class="linfo"><div class="ltitle">${s.name}</div><div class="lsub">${s.email} · ${s.country||'N/A'} · ${s.category||'General'} · Joined ${s.joined||'N/A'}</div></div>
          <span class="bdg live">${ps} products</span>
          <div class="lprice">$${os.reduce((sum,o)=>sum+o.amount,0).toFixed(2)}</div><div class="larrow">›</div></div>`;
      }).join('')
    : '<div class="es"><div class="es-icon">🏪</div><h4>No sellers yet</h4></div>';
}

// ---- ADMIN HASH ROUTE ----
if (window.location.hash === '#admin') {
  document.getElementById('role-select').style.display = 'none';
  goAuth('admin');
}
window.addEventListener('hashchange', function () {
  if (window.location.hash === '#admin' && !DB.currentUser) {
    ['buyer-portal','seller-portal','admin-portal'].forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById('role-select').style.display = 'none';
    goAuth('admin');
  }
});
