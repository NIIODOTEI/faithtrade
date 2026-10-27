// ============================================================
//  FAITHTRADE — SUPABASE INTEGRATION  (v2 — 5 fixes applied)
//  1. Password show/hide toggle
//  2. Currency fixed to GHS
//  3. Logo click → home
//  4. Email OTP verification on signup
//  5. Phone number field on signup
// ============================================================

const SUPA_URL = 'https://bfvrayjrfrgufszvpxqj.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmdnJheWpyZnJndWZzenZweHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTY4MjUsImV4cCI6MjA5NTQzMjgyNX0.GRsk7bslH2ipKYrYgE9c3HDeD2mbDdcm08s__FFxvTM';
const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

// ---- LOCAL STATE ----
let DB = { currentUser: null, cart: [], products: [] };
let activeCat = 'all', searchQ = '', activeChatThread = null;
let editingProductId = null, currentImgData = null;
let editingOrderId = null, cancelingOrderId = null, deletingProductId = null;
let pendingRegData = null; // holds registration data while OTP is being verified

// ============================================================
//  MAPPERS
// ============================================================

// ============================================================
//  FIX 2 — MAP PREVIEW IN CHECKOUT
// ============================================================
function updateMap(addr) {
  const wrap  = document.getElementById('co-map-wrap');
  const frame = document.getElementById('co-map-frame');
  if (!addr || addr.length < 5) { if (wrap) wrap.style.display = 'none'; return; }
  const city = document.getElementById('co-city')?.value || 'Accra';
  const q    = encodeURIComponent(addr + ', ' + city + ', Ghana');
  if (frame) frame.src = 'https://maps.google.com/maps?q=' + q + '&output=embed&z=15';
  if (wrap)  wrap.style.display = 'block';
}

// ============================================================
//  FIX 5 — PRODUCT DETAIL MODAL (BUYER)
// ============================================================
function openProdDetail(id) {
  const p = DB.products.find(x => x.id === id); if (!p) return;
  document.getElementById('pdm-img').innerHTML    = prodImg(p, 200);
  document.getElementById('pdm-name').textContent = p.name;
  document.getElementById('pdm-country').textContent = '📍 ' + (p.country || '');
  document.getElementById('pdm-seller').textContent  = p.seller;
  document.getElementById('pdm-price').textContent   = 'GHS ' + p.price.toFixed(2);
  document.getElementById('pdm-desc').textContent    = p.desc || 'No description provided.';

  // Details
  const details = { Colors: p.colors, Sizes: p.sizes, Dimensions: p.dimensions, Weight: p.weight, Material: p.material, Brand: p.brand, Notes: p.notes, 'Qty Available': p.qty_available };
  const grid = document.getElementById('pdm-details-grid');
  const section = document.getElementById('pdm-details');
  const rows = Object.entries(details).filter(([,v]) => v);
  if (rows.length && grid) {
    grid.innerHTML = rows.map(([k,v]) =>
      `<div style="background:var(--teal-soft);border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)">${k}</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:3px">${v}</div>
      </div>`
    ).join('');
    if (section) section.style.display = 'block';
  } else if (section) section.style.display = 'none';

  // Wire add button
  const btn = document.getElementById('pdm-add-btn');
  if (btn) btn.onclick = () => { addToCart(id); document.getElementById('prod-detail-modal').classList.remove('open'); };

  document.getElementById('prod-detail-modal').classList.add('open');
}

// ============================================================
//  FIX 7 — MOMO PAYMENT BEFORE DELIVERY
// ============================================================
async function showMomoPayNotice() {
  // Load MoMo details from settings
  const { data } = await sb.from('settings').select('*').in('key', ['momo_network','momo_number','momo_name']);
  const s = {};
  (data||[]).forEach(r => s[r.key] = r.value);
  const notice  = document.getElementById('momo-pay-notice');
  const refWrap = document.getElementById('momo-ref-wrap');
  const netEl   = document.getElementById('notice-momo-net');
  const numEl   = document.getElementById('notice-momo-num');
  const nameEl  = document.getElementById('notice-momo-name');
  if (netEl)  netEl.textContent  = s.momo_network  || 'MTN MoMo';
  if (numEl)  numEl.textContent  = s.momo_number   || 'Not set';
  if (nameEl) nameEl.textContent = s.momo_name     || 'FaithTrade';
  if (notice)  notice.style.display  = 'block';
  if (refWrap) refWrap.style.display = 'block';
}

// ============================================================
//  FIX 8 — BUYER CONFIRMS DELIVERY
// ============================================================
async function confirmDelivery(orderId) {
  const { error } = await sb.from('orders').update({ status: 'delivered' }).eq('id', orderId);
  if (error) { toast('Failed to confirm delivery', 'e'); return; }
  playDeliverySound();
  toast('🎉 Delivery confirmed! Thank you for your order.');
  renderBuyerOrders();
}

// ============================================================
//  FIX 6 — SAVE PRODUCT DETAILS TO SUPABASE
// ============================================================
function getProductDetails() {
  return {
    colors:     document.getElementById('ap-colors')?.value?.trim()     || null,
    sizes:      document.getElementById('ap-sizes')?.value?.trim()      || null,
    dimensions: document.getElementById('ap-dimensions')?.value?.trim() || null,
    weight:     document.getElementById('ap-weight')?.value?.trim()     || null,
    material:   document.getElementById('ap-material')?.value?.trim()   || null,
    brand:      document.getElementById('ap-brand')?.value?.trim()      || null,
    notes:      document.getElementById('ap-notes')?.value?.trim()      || null,
  };
}

function clearProductDetailFields() {
  ['ap-colors','ap-sizes','ap-dimensions','ap-weight','ap-material','ap-brand','ap-notes']
    .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
}


// ============================================================
//  GPS LOCATION
// ============================================================
function getGPSLocation() {
  if (!navigator.geolocation) { toast('Geolocation not supported by your browser', 'e'); return; }
  toast('📍 Getting your location...');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await res.json();
        const addr = data.display_name || (latitude.toFixed(4) + ', ' + longitude.toFixed(4));
        const road = data.address?.road || data.address?.suburb || '';
        const inp  = document.getElementById('co-addr');
        if (inp) { inp.value = road || addr; updateMap(inp.value); }
        // Auto-set city
        const city = data.address?.city || data.address?.town || data.address?.village || '';
        const cityEl = document.getElementById('co-city');
        if (cityEl && city) {
          const opts = Array.from(cityEl.options).map(o => o.value.toLowerCase());
          const match = opts.findIndex(c => city.toLowerCase().includes(c) || c.includes(city.toLowerCase()));
          if (match >= 0) cityEl.selectedIndex = match;
        }
        toast('📍 Location detected!');
      } catch(e) {
        toast('Could not resolve address — please type it manually', 'e');
      }
    },
    (err) => { toast('Location access denied — please type your address', 'e'); }
  );
}

// ============================================================
//  REVIEWS
// ============================================================
let _reviewRating = 0;

function setRating(n) {
  _reviewRating = n;
  document.getElementById('review-rating').value = n;
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('star-' + i);
    if (el) el.style.filter = i <= n ? 'none' : 'grayscale(1)';
  }
}

function openReviewModal(orderId, productId, productName) {
  _reviewRating = 0;
  setRating(0);
  document.getElementById('review-order-id').value    = orderId;
  document.getElementById('review-product-id').value  = productId;
  document.getElementById('review-product-name').textContent = 'Rate: ' + productName;
  document.getElementById('review-text').value = '';
  document.getElementById('review-modal').classList.add('open');
}

async function submitReview() {
  const rating  = _reviewRating;
  const text    = document.getElementById('review-text')?.value?.trim();
  const orderId = document.getElementById('review-order-id')?.value;
  const prodId  = document.getElementById('review-product-id')?.value;
  if (!rating) { toast('Please select a star rating', 'e'); return; }
  if (!text)   { toast('Please write a review', 'e'); return; }
  const { error } = await sb.from('reviews').insert([{
    order_id: orderId, product_id: prodId,
    buyer_id: DB.currentUser.id, buyer_name: DB.currentUser.name,
    rating, text, created_at: new Date().toISOString()
  }]);
  if (error) { toast('Review failed: ' + error.message, 'e'); return; }
  // Mark order as reviewed
  await sb.from('orders').update({ reviewed: true }).eq('id', orderId);
  document.getElementById('review-modal').classList.remove('open');
  toast('Review submitted ⭐ Thank you!');
  renderBuyerOrders();
}

async function loadProductReviews(productId) {
  const { data } = await sb.from('reviews').select('*').eq('product_id', productId).order('created_at', { ascending: false });
  return data || [];
}

// ============================================================
//  ADMIN: COMMUNITY FEED
// ============================================================
async function openPostModal() {
  document.getElementById('post-title').value   = '';
  document.getElementById('post-content').value = '';
  document.getElementById('post-modal').classList.add('open');
}

async function submitFeedPost() {
  const title   = document.getElementById('post-title')?.value?.trim();
  const content = document.getElementById('post-content')?.value?.trim();
  const type    = document.getElementById('post-type')?.value || 'Announcement';
  if (!title || !content) { toast('Fill in title and content', 'e'); return; }
  const { error } = await sb.from('feed_posts').insert([{
    title, content, type, created_at: new Date().toISOString(),
    author: 'Admin'
  }]);
  if (error) { toast('Post failed: ' + error.message, 'e'); return; }
  document.getElementById('post-modal').classList.remove('open');
  toast('Post published! ✓');
  loadFeedPosts();
}

async function loadFeedPosts() {
  const el = document.getElementById('a-feed-list');
  if (!el) return;
  const { data } = await sb.from('feed_posts').select('*').order('created_at', { ascending: false });
  if (!data || !data.length) {
    el.innerHTML = '<div class="es"><div class="es-icon">📰</div><h4>No posts yet</h4><p>Create the first community post.</p></div>';
    return;
  }
  el.innerHTML = data.map(p => `
    <div class="lr" style="align-items:flex-start">
      <div class="lthumb" style="font-size:22px">${p.type?.split(' ')[0] || '📢'}</div>
      <div class="linfo">
        <div class="ltitle">${p.title}</div>
        <div class="lsub">${new Date(p.created_at).toLocaleDateString('en-GB')} · ${p.type}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px">${p.content}</div>
      </div>
      <button class="del-btn" onclick="deleteFeedPost('${p.id}')">🗑️</button>
    </div>`).join('');
}

async function deleteFeedPost(id) {
  if (!confirm('Delete this post?')) return;
  await sb.from('feed_posts').delete().eq('id', id);
  toast('Post deleted'); loadFeedPosts();
}

// ============================================================
//  ADMIN: PROMOTIONS
// ============================================================
async function savePromotion() {
  const title    = document.getElementById('promo-title')?.value?.trim();
  const type     = document.getElementById('promo-type')?.value;
  const duration = document.getElementById('promo-duration')?.value;
  const target   = document.getElementById('promo-target')?.value?.trim();
  const desc     = document.getElementById('promo-desc')?.value?.trim();
  if (!title || !target) { toast('Fill in title and target ID', 'e'); return; }
  const expiresAt = new Date(Date.now() + parseDuration(duration)).toISOString();
  const { error } = await sb.from('promotions').insert([{
    title, type, duration, target_id: target, description: desc,
    created_at: new Date().toISOString(), expires_at: expiresAt, active: true
  }]);
  if (error) { toast('Failed: ' + error.message, 'e'); return; }
  toast('Promotion launched! 🚀');
  loadPromotions();
}

function parseDuration(d) {
  if (d.includes('24')) return 86400000;
  if (d.includes('3 Day')) return 3*86400000;
  if (d.includes('7')) return 7*86400000;
  if (d.includes('14')) return 14*86400000;
  return 30*86400000;
}

async function loadPromotions() {
  const el = document.getElementById('promo-list');
  if (!el) return;
  const { data } = await sb.from('promotions').select('*').order('created_at', { ascending: false });
  if (!data || !data.length) {
    el.innerHTML = '<div class="es"><div class="es-icon">🎯</div><h4>No promotions yet</h4></div>';
    return;
  }
  el.innerHTML = data.map(p => {
    const exp  = new Date(p.expires_at);
    const done = exp < new Date();
    return `<div class="lr">
      <div class="lthumb" style="font-size:22px">🎯</div>
      <div class="linfo">
        <div class="ltitle">${p.title}</div>
        <div class="lsub">${p.type} · Target: ${p.target_id} · Expires: ${exp.toLocaleDateString('en-GB')}</div>
      </div>
      <span class="bdg ${done ? 'cancelled' : 'live'}">${done ? 'Expired' : 'Active'}</span>
      <button class="del-btn" onclick="deletePromo('${p.id}')">🗑️</button>
    </div>`;
  }).join('');
}

async function deletePromo(id) {
  if (!confirm('Remove this promotion?')) return;
  await sb.from('promotions').delete().eq('id', id);
  toast('Promotion removed'); loadPromotions();
}

// ============================================================
//  ADMIN: REMOVE LISTING
// ============================================================
async function adminRemoveListing(productId, productName) {
  if (!confirm('Remove listing: ' + productName + '?')) return;
  const { error } = await sb.from('products').delete().eq('id', productId);
  if (error) { toast('Failed to remove: ' + error.message, 'e'); return; }
  DB.products = DB.products.filter(p => p.id !== productId);
  toast(productName + ' removed from marketplace ✓');
  refreshAdmin();
}

// ============================================================
//  RENDER CHAT MESSAGES WITH EDIT/DELETE
// ============================================================

// ── FEED LOADING FOR BUYER / SELLER ──────────────────────────
async function loadBuyerFeed() {
  const el = document.getElementById('b-feed-list');
  if (!el) return;
  try {
    const { data } = await sb.from('feed_posts').select('*').order('created_at', { ascending: false });
    renderFeedList(el, data);
  } catch(e) { el.innerHTML = '<div class="es"><div class="es-icon">📰</div><h4>Feed unavailable</h4></div>'; }
}

async function loadSellerFeed() {
  const el = document.getElementById('s-feed-list');
  if (!el) return;
  try {
    const { data } = await sb.from('feed_posts').select('*').order('created_at', { ascending: false });
    renderFeedList(el, data);
  } catch(e) { el.innerHTML = '<div class="es"><div class="es-icon">📰</div><h4>Feed unavailable</h4></div>'; }
}

function renderFeedList(el, data) {
  if (!data || !data.length) {
    el.innerHTML = '<div class="es"><div class="es-icon">📰</div><h4>No announcements yet</h4><p>Check back soon for updates from FaithTrade.</p></div>';
    return;
  }
  el.innerHTML = data.map(p => `
    <div style="padding:16px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-start">
      <div style="font-size:28px;flex-shrink:0">${p.type?.split(' ')[0] || '📢'}</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px">${p.title}</div>
        <div style="font-size:12px;color:var(--text-mid);line-height:1.6;margin-bottom:6px">${p.content}</div>
        <div style="font-size:10px;color:var(--text-muted);font-weight:600">${p.type} · ${new Date(p.created_at).toLocaleDateString('en-GB')}</div>
      </div>
    </div>`).join('');
}

function mapProduct(r) {
  return {
    id: r.id, name: r.name, emoji: r.emoji || '📦',
    image: r.image || null, price: parseFloat(r.price),
    category: r.category, country: r.country,
    desc: r.description, seller: r.seller, sellerId: r.seller_id,
    type: r.type || 'product',
    qty_available: r.qty_available || null,
    colors: r.colors || null, sizes: r.sizes || null,
    dimensions: r.dimensions || null, weight: r.weight || null,
    material: r.material || null, brand: r.brand || null,
    notes: r.notes || null,
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
    category: r.category, joined: r.joined, phone: r.phone,
    verified: r.verified
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
  setTimeout(() => el.classList.remove('show'), 3500);
}

function showLoading(id, msg = 'Loading...') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="es"><div class="es-icon">⏳</div><h4>${msg}</h4></div>`;
}

function prodImg(p, size) {
  if (p && p.image) return `<img src="${p.image}" alt="${p.name}" style="width:100%;height:${size}px;object-fit:cover;">`;
  return `<div style="width:100%;height:${size}px;background:linear-gradient(135deg,#E8F5F3,#C8E8E4);display:flex;align-items:center;justify-content:center;font-size:${size > 80 ? 48 : 22}px">${(p && p.emoji) || '📦'}</div>`;
}

function orderTimeLeft(o) {
  if (!o.placedAt) return { ok: false, label: 'Expired' };
  const left = (10 * 60 * 1000) - (Date.now() - o.placedAt);
  if (left <= 0) return { ok: false, label: 'Window closed' };
  return { ok: true, label: `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m left` };
}

// ============================================================
//  FIX 1 — PASSWORD SHOW / HIDE TOGGLE
// ============================================================
function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
    btn.title = 'Hide password';
  } else {
    inp.type = 'password';
    btn.textContent = '👁️';
    btn.title = 'Show password';
  }
}

// Password input wrapper with toggle button
function passField(inputId, placeholder = 'Enter password...') {
  return `
    <div style="position:relative">
      <input class="inp" id="${inputId}" type="password" placeholder="${placeholder}" style="padding-right:44px">
      <button type="button" onclick="togglePass('${inputId}',this)"
        title="Show password"
        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:17px;color:var(--text-muted);padding:0;line-height:1">👁️</button>
    </div>`;
}

// ============================================================
//  FIX 4 — OTP EMAIL VERIFICATION
// ============================================================
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOTPEmail(email, otp, name) {
  // Using EmailJS public API — service/template IDs below
  // Sign up free at emailjs.com → create service → create template
  // Template variables: {{to_name}}, {{otp}}, {{to_email}}
  const EMAILJS_SERVICE  = 'service_dzylge5';
  const EMAILJS_TEMPLATE = 'template_q16oxpm';
  const EMAILJS_KEY      = 'DRiIICuQZSVOof45u';

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  EMAILJS_SERVICE,
        template_id: EMAILJS_TEMPLATE,
        user_id:     EMAILJS_KEY,
        template_params: { to_name: name, otp, to_email: email }
      })
    });
    return res.ok;
  } catch (e) {
    console.error('EmailJS error:', e);
    return false;
  }
}

// Show the OTP verification box after registration form submit
function showOTPBox(role) {
  const box = document.getElementById('auth-box');
  const email = pendingRegData?.email || '';
  box.innerHTML = `
    <div class="auth-title">Verify Your Account ✉️</div>
    <div class="auth-sub" style="margin-bottom:20px">We sent a 6-digit code to<br><strong>${email}</strong></div>
    <div style="background:var(--teal-soft);border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:12px;color:var(--teal-darker);font-weight:600;line-height:1.6">
      ℹ️ Check your email inbox and spam folder. The code expires in <strong>10 minutes</strong>.
    </div>
    <label class="lbl">Enter 6-digit Code</label>
    <input class="inp" id="otp-input" type="text" maxlength="6" placeholder="e.g. 482910"
      style="font-size:22px;font-weight:800;letter-spacing:6px;text-align:center"
      oninput="this.value=this.value.replace(/[^0-9]/g,'')">
    <button class="auth-btn-main" onclick="verifyOTP('${role}')" style="margin-top:8px">VERIFY & CREATE ACCOUNT</button>
    <button class="cbtn" style="margin-top:10px;width:100%" onclick="resendOTP('${role}')">Resend Code</button>
    <div class="auth-sw" style="margin-top:14px"><a onclick="renderAuth('${role}',true)">← Back</a></div>
  `;
}

async function resendOTP(role) {
  if (!pendingRegData) return;
  const otp     = generateOTP();
  const expires = Date.now() + 10 * 60 * 1000;
  await sb.from('users').update({ otp, otp_expires: expires }).eq('id', pendingRegData.id);
  pendingRegData.otp = otp;
  await sendOTPEmail(pendingRegData.email, otp, pendingRegData.name);
  toast('New code sent! Check your inbox 📧');
}

async function verifyOTP(role) {
  const entered = document.getElementById('otp-input')?.value?.trim();
  if (!entered || entered.length !== 6) { toast('Enter the 6-digit code', 'e'); return; }
  if (!pendingRegData) { toast('Session expired, please register again', 'e'); renderAuth(role, true); return; }

  // Fetch latest OTP from DB
  const { data } = await sb.from('users').select('otp,otp_expires').eq('id', pendingRegData.id).single();
  if (!data) { toast('User not found', 'e'); return; }
  if (Date.now() > data.otp_expires) { toast('Code expired — request a new one', 'e'); return; }
  if (entered !== data.otp) { toast('Incorrect code — try again', 'e'); return; }

  // Mark as verified
  await sb.from('users').update({ verified: true, otp: null, otp_expires: null }).eq('id', pendingRegData.id);
  DB.currentUser = { ...pendingRegData, verified: true };
  toast('Email verified! Welcome to FaithTrade 🎉');
  pendingRegData = null;
  showPortal(role);
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

  // FIX 5 — Phone field + FIX 2 — GHS only currency
  let extra = '';
  if (isReg && role === 'buyer') {
    extra = `
      <label class="lbl">Phone Number</label>
      <div style="display:flex;gap:8px">
        <select class="inp" id="r-dialcode" style="width:100px;flex-shrink:0">
          <option value="+233">🇬🇭 +233</option>
          <option value="+234">🇳🇬 +234</option>
          <option value="+254">🇰🇪 +254</option>
          <option value="+27">🇿🇦 +27</option>
          <option value="+1">🇺🇸 +1</option>
          <option value="+44">🇬🇧 +44</option>
          <option value="+49">🇩🇪 +49</option>
          <option value="+91">🇮🇳 +91</option>
        </select>
        <input class="inp" id="r-phone" type="tel" placeholder="024 XXX XXXX" style="flex:1">
      </div>
      <label class="lbl">Country</label>
      <select class="inp" id="r-country">
        <option>Ghana</option><option>Nigeria</option><option>Kenya</option>
        <option>South Africa</option><option>United States</option>
        <option>United Kingdom</option><option>Germany</option>
        <option>Canada</option><option>India</option><option>Other</option>
      </select>
      <label class="lbl">Currency</label>
      <input class="inp" id="r-cur" value="GHS" readonly
        style="background:var(--teal-soft);color:var(--teal-dark);font-weight:700;cursor:default">`;
  }
  if (isReg && role === 'seller') {
    extra = `
      <label class="lbl">Phone Number</label>
      <div style="display:flex;gap:8px">
        <select class="inp" id="r-dialcode" style="width:100px;flex-shrink:0">
          <option value="+233">🇬🇭 +233</option>
          <option value="+234">🇳🇬 +234</option>
          <option value="+254">🇰🇪 +254</option>
          <option value="+27">🇿🇦 +27</option>
          <option value="+1">🇺🇸 +1</option>
          <option value="+44">🇬🇧 +44</option>
          <option value="+49">🇩🇪 +49</option>
          <option value="+91">🇮🇳 +91</option>
        </select>
        <input class="inp" id="r-phone" type="tel" placeholder="024 XXX XXXX" style="flex:1">
      </div>
      <label class="lbl">Country of Operation</label>
      <select class="inp" id="r-country">
        <option>Ghana</option><option>Nigeria</option><option>Kenya</option>
        <option>South Africa</option><option>Morocco</option>
        <option>United States</option><option>United Kingdom</option>
        <option>Germany</option><option>India</option><option>China</option>
      </select>
      <label class="lbl">Business Category</label>
      <select class="inp" id="r-cat">
        <option>General Merchandise</option><option>Fashion &amp; Apparel</option>
        <option>Food &amp; Agriculture</option><option>Crafts &amp; Art</option>
        <option>Electronics</option><option>Health &amp; Beauty</option>
      </select>`;
  }

  const adminBadge = role === 'admin'
    ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:100px;background:rgba(23,79,68,0.08);border:1.5px solid rgba(23,79,68,0.2);color:var(--teal-darker);font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:20px">🔐 Restricted Access</div><br>` : '';

  box.innerHTML = `
    ${adminBadge}
    <div class="auth-title">${isReg ? 'Create Account' : 'Welcome Back!'}</div>
    <div class="auth-sub">${isReg ? 'Join FaithTrade as a ' + role.charAt(0).toUpperCase() + role.slice(1) : 'Log Into Your Account'}</div>
    ${isReg ? `<label class="lbl">${role === 'seller' ? 'Business Name' : 'Full Name'}</label>
      <input class="inp" id="r-name" placeholder="Enter ${role === 'seller' ? 'business name' : 'full name'}...">` : ''}
    <label class="lbl">Email or Phone Number</label>
    <input class="inp" id="a-email" type="text" placeholder="Enter email or phone number...">
    <label class="lbl">Password</label>
    ${passField('a-pass')}
    ${extra}
    <button class="auth-btn-main" onclick="doAuth('${role}',${isReg})" style="margin-top:12px">${isReg ? 'SIGN UP' : 'LOGIN'}</button>
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

  // Allow email OR phone number — only validate if looks like email
  const looksLikeEmail = email.includes('@');
  if (looksLikeEmail) {
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) { toast('Please enter a valid email address', 'e'); return; }
  }

  if (role === 'admin') {
    const { data, error } = await sb.from('users').select('*').eq('role','admin').eq('email', email).eq('password', pass).single();
    if (error || !data) { toast('Invalid admin credentials', 'e'); return; }
    DB.currentUser = mapUser(data);
    showPortal('admin');
    return;
  }

  if (isReg) {
    // Check duplicate
    const { data: existing } = await sb.from('users').select('id').eq('email', email).eq('role', role);
    if (existing && existing.length > 0) { toast('Email already registered for this role', 'e'); return; }

    const name    = document.getElementById('r-name')?.value?.trim() || email.split('@')[0];
    const country = document.getElementById('r-country')?.value || 'Ghana';
    const dialcode = document.getElementById('r-dialcode')?.value || '+233';
    const phoneRaw = document.getElementById('r-phone')?.value?.trim() || '';
    const phone   = phoneRaw ? dialcode + ' ' + phoneRaw : null;

    if (!name) { toast('Please enter your name', 'e'); return; }
    if (!phone) { toast('Please enter your phone number', 'e'); return; }

    const otp     = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000;

    const newUser = {
      id: 'U' + Date.now(), role, email, password: pass, name, country, phone,
      joined:   new Date().toLocaleDateString('en-GB'),
      currency: role === 'buyer'  ? 'GHS' : null,
      category: role === 'seller' ? (document.getElementById('r-cat')?.value || 'General') : null,
      verified: false, otp, otp_expires: expires
    };

    const { error } = await sb.from('users').insert([newUser]);
    if (error) { toast('Registration failed: ' + error.message, 'e'); return; }

    pendingRegData = newUser;

    // Send OTP email
    toast('Sending verification code to ' + email + ' 📧');
    const sent = await sendOTPEmail(email, otp, name);
    if (!sent) {
      // EmailJS not configured yet — show OTP in toast for testing
      toast('⚠️ Email not configured. Your test code is: ' + otp, 'e');
    }

    showOTPBox(role);

  } else {
    // Allow login with email OR phone number (normalise input)
    const rawInput  = email.trim();
    const normPhone = rawInput.replace(/\s+/g,''); // strip spaces e.g. "024 123" → "024123"
    let { data, error } = await sb.from('users').select('*').eq('email', rawInput).eq('password', pass).eq('role', role).single();
    if (!data) {
      // Try phone — match against stored phone which may include dial code & spaces
      const { data: all } = await sb.from('users').select('*').eq('password', pass).eq('role', role);
      if (all) {
        const match = all.find(u => {
          if (!u.phone) return false;
          const stored = u.phone.replace(/\s+/g,'');
          return stored === normPhone || stored.endsWith(normPhone) || normPhone.endsWith(stored.slice(-9));
        });
        if (match) { data = match; error = null; }
      }
    }
    if (error || !data) { toast('Invalid credentials — check your email or phone', 'e'); return; }
    if (!data.verified) {
      toast('Please verify your email first', 'e');
      pendingRegData = mapUser(data);
      // Resend OTP
      const otp     = generateOTP();
      const expires = Date.now() + 10 * 60 * 1000;
      await sb.from('users').update({ otp, otp_expires: expires }).eq('id', data.id);
      pendingRegData.otp = otp;
      await sendOTPEmail(email, otp, data.name);
      showOTPBox(role);
      return;
    }
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
  // Load promoted product IDs
  try {
    const { data: promos } = await sb.from('promotions').select('target_id,expires_at').eq('active', true);
    DB.promotedIds = (promos||[]).filter(p => new Date(p.expires_at) > new Date()).map(p => p.target_id);
  } catch(e) { DB.promotedIds = []; }
  if (role === 'buyer')  await initBuyer();
  if (role === 'seller') await initSeller();
  if (role === 'admin')  await initAdmin();
}

async function logout() {
  document.getElementById('logout-confirm-modal').classList.add('open');
}

async function confirmLogout() {
  DB.currentUser = null; DB.cart = []; updCart();
  document.getElementById('logout-confirm-modal').classList.remove('open');
  ['buyer-portal','seller-portal','admin-portal'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('role-select').style.display = 'flex';
  toast('Signed out successfully');
}

// ============================================================
//  FIX 3 — LOGO CLICK → HOME
// ============================================================
function goHome() {
  const u = DB.currentUser;
  if (!u) {
    // Not logged in — go to role select
    ['auth-screen','buyer-portal','seller-portal','admin-portal']
      .forEach(id => document.getElementById(id).style.display = 'none');
    document.getElementById('role-select').style.display = 'flex';
    return;
  }
  // Logged in — go to home tab of their portal
  if (u.role === 'buyer') {
    bNav('home', document.querySelectorAll('#buyer-portal .ni')[0]);
  } else if (u.role === 'seller') {
    sNav('home', document.querySelectorAll('#seller-portal .ni')[0]);
  } else if (u.role === 'admin') {
    aNav('overview', document.querySelectorAll('#admin-portal .ni')[0]);
  }
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
  if (page === 'feed')     loadBuyerFeed();
}



function guestSignUp() {
  document.getElementById('guest-register-modal').classList.remove('open');
  document.getElementById('buyer-portal').style.display = 'none';
  goAuth('buyer');
  setTimeout(() => renderAuth('buyer', true), 100);
}

function guestSignIn() {
  document.getElementById('guest-register-modal').classList.remove('open');
  document.getElementById('buyer-portal').style.display = 'none';
  goAuth('buyer');
  setTimeout(() => renderAuth('buyer', false), 100);
}

// ============================================================
//  GUEST BROWSE MODE
// ============================================================
async function browseAsGuest() {
  document.getElementById('role-select').style.display = 'none';
  document.getElementById('buyer-portal').style.display = 'block';
  DB.currentUser = null;

  // Load products
  const { data: prods } = await sb.from('products').select('*');
  DB.products = (prods || []).map(mapProduct);

  // Set guest UI
  const ava = document.getElementById('b-ava');
  if (ava) ava.textContent = '👤';
  const uname = document.getElementById('b-uname');
  if (uname) uname.textContent = 'Guest';
  const hname = document.getElementById('b-hname');
  if (hname) hname.textContent = 'Guest';

  renderHomePg(); renderBrowsePg(); updCart();
}

// Home page search
let homeSearchQ = '';
function homeSearch(q) {
  homeSearchQ = q.toLowerCase().trim();
  const titleEl = document.getElementById('home-pg-title');
  const subEl   = document.getElementById('home-pg-sub');
  if (homeSearchQ) {
    const results = DB.products.filter(p =>
      p.name.toLowerCase().includes(homeSearchQ) ||
      (p.desc || '').toLowerCase().includes(homeSearchQ) ||
      p.category.toLowerCase().includes(homeSearchQ) ||
      p.seller.toLowerCase().includes(homeSearchQ)
    );
    if (titleEl) titleEl.textContent = 'Search Results';
    if (subEl)   subEl.textContent   = results.length + ' result(s) for "' + q + '"';
    document.getElementById('home-pg').innerHTML = results.length
      ? results.map(ptHTML).join('')
      : '<div class="es"><div class="es-icon">🔍</div><h4>No results found</h4><p>Try a different keyword.</p></div>';
  } else {
    if (titleEl) titleEl.textContent = 'Featured Products';
    if (subEl)   subEl.textContent   = 'Handpicked from top sellers worldwide';
    renderHomePg();
  }
}

// Filter by type (services)
let activeType = '';
function fType(type, btn) {
  activeType = type;
  activeCat  = 'all';
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderBrowsePg();
}

function renderHomePg() {
  document.getElementById('home-pg').innerHTML = DB.products.slice(0, 6).map(ptHTML).join('');
}

function ptHTML(p) {
  const badge = p.qty_available ? `<span style="font-size:10px;background:var(--teal-soft);color:var(--teal-dark);padding:2px 7px;border-radius:100px;font-weight:700">${p.qty_available} left</span>` : '';
  return `<div class="pt">
    <div class="pt-img" style="height:140px;overflow:hidden;cursor:pointer" onclick="openProdDetail('${p.id}')">${prodImg(p, 140)}</div>
    <div class="pt-body">
      <div class="pt-country">📍 ${p.country} ${badge}</div>
      <div class="pt-name" style="cursor:pointer" onclick="openProdDetail('${p.id}')">${p.name}</div>
      <div class="pt-seller">by ${p.seller}</div>
      <div class="pt-foot">
        <div class="pt-price">GHS ${p.price.toFixed(2)}</div>
        <button class="atc" onclick="addToCart('${p.id}')">ADD</button>
      </div>
    </div>
  </div>`;
}

function renderBrowsePg() {
  let ps = DB.products;
  if (activeType === 'service')      ps = ps.filter(p => p.type === 'service');
  else if (activeFilter === 'promoted') ps = ps.filter(p => DB.promotedIds && DB.promotedIds.includes(p.id));
  else if (activeCat !== 'all')      ps = ps.filter(p => p.category === activeCat);
  if (searchQ) ps = ps.filter(p =>
    p.name.toLowerCase().includes(searchQ) || (p.desc || '').toLowerCase().includes(searchQ)
  );
  // Sort
  const sort = document.getElementById('browse-sort')?.value || 'default';
  if (sort === 'price_asc')  ps = [...ps].sort((a,b) => a.price - b.price);
  if (sort === 'price_desc') ps = [...ps].sort((a,b) => b.price - a.price);
  if (sort === 'newest')     ps = [...ps].reverse();
  const g = document.getElementById('browse-pg');
  g.innerHTML = ps.length
    ? ps.map(ptHTML).join('')
    : '<div class="es"><div class="es-icon">🔍</div><h4>No products found</h4><p>Try a different search or filter.</p></div>';
}

function fCat(cat, btn) {
  activeCat    = cat;
  activeType   = '';
  activeFilter = '';
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderBrowsePg();
}

let activeFilter = '';
function fFilter(filter, btn) {
  activeFilter = filter;
  activeCat    = 'all';
  activeType   = '';
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderBrowsePg();
}

function searchProd(q) { searchQ = q.toLowerCase(); renderBrowsePg(); }

// ---- CART ----
function addToCart(id) {
  const p = DB.products.find(p => p.id === id); if (!p) return;
  // Guest user — prompt registration before adding to cart
  if (!DB.currentUser) {
    document.getElementById('guest-register-modal').classList.add('open');
    sessionStorage.setItem('pendingCartId', id);
    return;
  }
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
    document.getElementById('cart-total').textContent = 'GHS 0.00';
  } else {
    items.innerHTML = DB.cart.map(c =>
      `<div class="ci">
        <div class="ci-thumb" style="overflow:hidden">${prodImg(c, 46)}</div>
        <div><div class="ci-name">${c.name}</div><div class="ci-price">GHS ${(c.price * 15).toFixed(2)} × ${c.qty}</div></div>
        <button class="ci-rm" onclick="rmCart('${c.id}')">✕</button>
      </div>`
    ).join('');
    document.getElementById('cart-total').textContent =
      'GHS ' + DB.cart.reduce((s, c) => s + (c.price * 15) * c.qty, 0).toFixed(2);
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
  if (u?.phone) document.getElementById('co-phone').value = u.phone;
  document.getElementById('checkout-modal').classList.add('open');
}
function closeCheckout() { document.getElementById('checkout-modal').classList.remove('open'); }


// ============================================================
//  PAYMENT METHOD SELECTOR
// ============================================================
function selPay(el, type) {
  document.querySelectorAll('.pay-opt').forEach(o => o.classList.remove('on'));
  el.classList.add('on');
  ['momo','card','cod','transfer'].forEach(t => {
    const d = document.getElementById('pay-' + t + '-details');
    if (d) d.style.display = t === type ? 'block' : 'none';
  });
  // Fix 7 — show MoMo pay-before-delivery notice
  const notice  = document.getElementById('momo-pay-notice');
  const refWrap = document.getElementById('momo-ref-wrap');
  if (type === 'momo') { showMomoPayNotice(); }
  else { if (notice) notice.style.display = 'none'; if (refWrap) refWrap.style.display = 'none'; }
  const labels = {
    momo: 'Mobile Money', card: 'Card Payment',
    cod: 'Cash on Delivery', transfer: 'Bank Transfer'
  };
  const inp = document.getElementById('co-pay');
  if (inp) inp.value = labels[type];
}

function fmtCard(inp) {
  let v = inp.value.replace(/\D/g,'').slice(0,16);
  inp.value = v.replace(/(\d{4})(?=\d)/g,'$1 ');
}

function fmtExpiry(inp) {
  let v = inp.value.replace(/\D/g,'').slice(0,4);
  if (v.length >= 2) v = v.slice(0,2) + '/' + v.slice(2);
  inp.value = v;
}

// ============================================================
//  COMMISSION (ADMIN)
// ============================================================
let currentCommission = 5;

async function loadCommission() {
  const { data } = await sb.from('settings').select('value').eq('key','commission_pct').single();
  if (data) {
    currentCommission = parseFloat(data.value) || 5;
    const inp = document.getElementById('commission-input');
    if (inp) inp.value = currentCommission;
    const rate = document.getElementById('a-comm-rate');
    if (rate) rate.textContent = currentCommission + '%';
    previewCommission();
  }
}

function previewCommission() {
  const pct = parseFloat(document.getElementById('commission-input')?.value) || 0;
  const earn = document.getElementById('comm-earn');
  const sel  = document.getElementById('comm-seller');
  if (earn) earn.textContent = 'GHS ' + pct.toFixed(2);
  if (sel)  sel.textContent  = 'GHS ' + (100 - pct).toFixed(2);
}

async function saveCommission() {
  const pct = parseFloat(document.getElementById('commission-input')?.value);
  if (isNaN(pct) || pct < 0 || pct > 50) { toast('Enter a valid rate between 0% and 50%', 'e'); return; }
  const { error } = await sb.from('settings').upsert([{ key: 'commission_pct', value: String(pct) }]);
  if (error) { toast('Failed to save: ' + error.message, 'e'); return; }
  currentCommission = pct;
  // Update all commission displays
  const rate = document.getElementById('a-comm-rate');
  if (rate) rate.textContent = pct + '%';
  // Recalculate commission summary from live orders
  const rev = _allOrders.reduce((s,o) => s + o.amount, 0);
  const commEarned = rev * (pct / 100);
  const sellerPay  = rev - commEarned;
  const tot  = document.getElementById('a-comm-total');
  const pays = document.getElementById('a-comm-payouts');
  if (tot)  tot.textContent  = 'GHS ' + commEarned.toFixed(2);
  if (pays) pays.textContent = 'GHS ' + sellerPay.toFixed(2);
  previewCommission();
  const msg = document.getElementById('comm-saved-msg');
  if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 2500); }
  toast('Commission rate set to ' + pct + '% ✓');
}

async function placeOrder() {
  const g       = id => document.getElementById(id).value.trim();
  const name    = g('co-name'), email = g('co-email');
  const phone   = document.getElementById('co-phone').value.trim() || 'N/A';
  const addr    = g('co-addr'), city  = g('co-city');
  const country = document.getElementById('co-country').value;
  const pay = document.getElementById('co-pay')?.value || 'Mobile Money';
  if (!name || !email || !addr || !city) { toast('Please fill all shipping details', 'e'); return; }

  let payDetail = '';
  if (pay === 'Mobile Money') {
    const momoNet = document.getElementById('momo-network')?.value || '';
    const momoNum = document.getElementById('momo-number')?.value?.trim() || '';
    const momoRef = document.getElementById('momo-ref')?.value?.trim() || '';
    if (!momoNum) { toast('Please enter your MoMo number', 'e'); return; }
    payDetail = momoNet + ': ' + momoNum + (momoRef ? ' · Ref: ' + momoRef : '');
  } else if (pay === 'Card Payment') {
    const cardNum = document.getElementById('card-number')?.value?.trim() || '';
    if (!cardNum) { toast('Please enter your card number', 'e'); return; }
    payDetail = 'Card ending ' + cardNum.replace(/\s/g,'').slice(-4);
  } else if (pay === 'Cash on Delivery') {
    payDetail = 'Pay on delivery';
  } else if (pay === 'Bank Transfer') {
    payDetail = 'GCB Bank transfer';
  }

  const now = Date.now();
  const newOrders = DB.cart.map(item => ({
    id: (function(){
        const ts   = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).slice(2,6).toUpperCase();
        return 'FT-' + ts + '-' + rand;
      })(),
    buyer_id: DB.currentUser.id, buyer_name: name, buyer_email: email,
    buyer_phone: phone, buyer_address: addr + ', ' + city, buyer_country: country,
    payment: pay + (payDetail ? ' (' + payDetail + ')' : ''), seller_id: item.sellerId || null, seller_name: item.seller,
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
    const p   = DB.products.find(x => x.id === o.productId);
    const tw  = orderTimeLeft(o);
    const canAct      = o.status === 'pending' && tw.ok;
    const isCancelled = o.status === 'cancelled';
    const timerHtml   = o.status === 'pending'
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
      <div class="lprice">GHS ${o.amount.toFixed(2)}</div>
      <div class="order-actions">${actBtns}${msgBtn}${o.status==='shipped'?`<button class="oact-btn" style="background:#E8F5E9;color:#2E7D32;border:1.5px solid #A5D6A7;border-radius:7px;padding:5px 11px;font-family:Nunito,sans-serif;font-size:11px;font-weight:700;cursor:pointer" onclick="confirmDelivery('${o.id}')">✅ Confirm Delivery</button>`:''}${o.status==='delivered'&&!o.reviewed?`<button class="oact-btn" style="background:#FFF9E6;color:#E65100;border:1.5px solid #FFE0B2;border-radius:7px;padding:5px 11px;font-family:Nunito,sans-serif;font-size:11px;font-weight:700;cursor:pointer" onclick="openReviewModal('${o.id}','${o.productId}','${o.productName}')">⭐ Review</button>`:''}</div>
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
  if (page === 'feed')     loadSellerFeed();
}

async function refreshSellerDash() {
  const u = DB.currentUser;
  const { data: myOrders } = await sb.from('orders').select('*').eq('seller_id', u.id);
  const myO     = (myOrders || []).map(mapOrder);
  const myProds = DB.products.filter(p => p.sellerId === u.id);
  document.getElementById('s-rev').textContent   = 'GHS ' + (myO.reduce((s,o) => s + o.amount, 0) * 15).toFixed(2);
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
      <div class="linfo"><div class="ltitle">${o.buyerName} — ${o.productName}</div>
      <div class="lsub">${o.id} · ${o.date} · ${o.buyerCountry}</div></div>
      <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
      <div class="lprice">GHS ${o.amount.toFixed(2)}</div><div class="larrow">›</div>
    </div>`;
  }).join('');
}

function sellerProdRowHTML(p) {
  const tags = [p.colors&&('🎨 '+p.colors), p.sizes&&('📐 '+p.sizes), p.dimensions&&('📏 '+p.dimensions), p.weight&&('⚖️ '+p.weight), p.material&&('🧵 '+p.material), p.brand&&('™️ '+p.brand)]
    .filter(Boolean).map(v=>`<span style="font-size:10px;background:var(--teal-soft);color:var(--teal-dark);padding:2px 7px;border-radius:100px;font-weight:600;margin-right:3px">${v}</span>`).join('');
  const qtyBadge = p.qty_available ? `<span class="bdg pending">Qty: ${p.qty_available}</span>` : '';
  return `<div class="lr" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
    <div class="lthumb" style="overflow:hidden;flex-shrink:0">${prodImg(p, 46)}</div>
    <div class="linfo" style="min-width:160px">
      <div class="ltitle">${p.name}</div>
      <div class="lsub">${p.desc || ''} · ${p.country}</div>
      ${tags ? `<div style="margin-top:5px">${tags}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto">
      <span class="bdg live">Live</span>
      ${qtyBadge}
      <div class="lprice">GHS ${p.price.toFixed(2)}</div>
      <div class="prod-actions">
        <button class="edit-btn" onclick="openEditProd(this.dataset.id)" data-id="${p.id}">✏️ Edit</button>
        <button class="del-btn"  onclick="openDelModal(this.dataset.id)" data-id="${p.id}">🗑️ Delete</button>
      </div>
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
  // Inject search bar above list
  const searchBar = '<div style="display:flex;gap:8px;margin-bottom:14px"><div class="sbox" style="flex:1"><span style="color:var(--text-muted)">🔍</span><input type="text" id="s-ord-search" placeholder="Search by order number..." oninput="filterSellerOrders(this.value,window._sellerOrders)"></div></div>';
  window._sellerOrders = my;
  el.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:14px"><div class="sbox" style="flex:1"><span style="color:var(--text-muted)">🔍</span><input type="text" id="s-ord-search" placeholder="Search by order number, buyer or product..." oninput="filterSellerOrders(this.value,window._sellerOrders)"></div></div>';
  renderSellerOrdRows(my);
}


function renderSellerOrdRows(orders) {
  const el = document.getElementById('s-ord-list');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div class="es"><div class="es-icon">🔍</div><h4>No matching orders</h4></div>'; return; }
  el.innerHTML = orders.map(o => `
    <div class="lr">
      <div class="lthumb">${o.productEmoji}</div>
      <div class="linfo">
        <div class="ltitle">${o.buyerName} ordered ${o.productName} ×${o.qty}</div>
        <div class="lsub" style="display:flex;align-items:center;gap:6px">
          <span style="font-family:monospace;font-size:11px;background:var(--teal-soft);padding:2px 7px;border-radius:5px;cursor:pointer" onclick="copyOrderId('${o.id}')" title="Click to copy">${o.id} 📋</span>
          · ${o.date} · ${o.buyerCountry}
        </div>
      </div>
      <select style="padding:6px 10px;border:1.5px solid var(--border-mid);border-radius:8px;font-family:Nunito,sans-serif;font-size:11px;font-weight:700;color:var(--teal-dark);cursor:pointer;outline:none;background:white;"
        onchange="updStatus('${o.id}',this.value)">
        <option ${o.status==='pending'?'selected':''} value="pending">Pending</option>
        <option ${o.status==='processing'?'selected':''} value="processing">Processing</option>
        <option ${o.status==='shipped'?'selected':''} value="shipped">Shipped</option>
        <option ${o.status==='delivered'?'selected':''} value="delivered">Delivered</option>
      </select>
      <div class="lprice">GHS ${o.amount.toFixed(2)}</div>
    </div>`).join('');
}

function filterSellerOrders(q, orders) {
  if (!orders) return;
  const filtered = q.trim()
    ? orders.filter(o => o.id.toLowerCase().includes(q.toLowerCase()) || o.buyerName.toLowerCase().includes(q.toLowerCase()) || o.productName.toLowerCase().includes(q.toLowerCase()))
    : orders;
  renderSellerOrdRows(filtered);
}

function copyOrderId(id) {
  navigator.clipboard.writeText(id).then(() => toast('Order ID copied: ' + id + ' ✓')).catch(() => {
    const el = document.createElement('textarea');
    el.value = id; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    toast('Copied: ' + id + ' ✓');
  });
}

function playDeliverySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  } catch(e) { console.log('Sound not available'); }
}

async function updStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) { toast('Update failed', 'e'); return; }
  toast('Order ' + id + ' → ' + status);
  if (status === 'delivered') playDeliverySound();
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
    document.getElementById('ap-img-preview').src           = p.image;
    document.getElementById('ap-img-preview').style.display  = 'block';
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
  if (!tw.ok) { toast('Edit window has closed (10-minute limit)', 'e'); return; }
  editingOrderId = id;
  const p = DB.products.find(x => x.id === o.productId);
  document.getElementById('edit-order-sub').textContent        = 'Change quantity · ' + tw.label + ' remaining';
  document.getElementById('edit-order-name').textContent       = o.productName;
  document.getElementById('edit-order-price-info').textContent = 'GHS ' + (o.unitPrice * 15).toFixed(2) + ' each';
  document.getElementById('edit-order-img').innerHTML          = p ? prodImg(p, 48) : `<span style="font-size:22px">${o.productEmoji}</span>`;
  document.getElementById('edit-order-qty').value              = o.qty;
  document.getElementById('edit-order-new-total').textContent  = 'GHS ' + o.amount.toFixed(2);
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
  document.getElementById('edit-order-new-total').textContent = 'GHS ' + (parseFloat(data.unit_price) * 15 * qty).toFixed(2);
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
  if (!tw.ok) { toast('Cancel window has closed (10-minute limit)', 'e'); return; }
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
  const pfx = isB ? 'b' : 's';
  try {
    const { data: thread, error } = await sb.from('threads').select('*').eq('id', threadId).single();
    if (error || !thread) { toast('Could not open conversation', 'e'); return; }
    const topbarContent = document.getElementById(pfx + '-chat-topbar-content');
    const emptyTop      = document.getElementById(pfx + '-chat-empty-top');
    const inputBar      = document.getElementById(pfx + '-chat-input-bar');
    if (topbarContent) topbarContent.style.display = 'flex';
    if (emptyTop)      emptyTop.style.display      = 'none';
    if (inputBar)      inputBar.style.display       = 'flex';
    const otherName = isB ? thread.seller_name : thread.buyer_name;
    const nameEl = document.getElementById(pfx + '-chat-with-name');
    const subEl  = document.getElementById(pfx + '-chat-with-sub');
    const avaEl  = document.getElementById(pfx + '-chat-ava');
    if (nameEl) nameEl.textContent = otherName;
    if (subEl)  subEl.textContent  = isB ? 'Merchant' : 'Customer';
    if (avaEl)  avaEl.textContent  = otherName[0].toUpperCase();
    await renderChatMessages(role, threadId);
    if (isB) renderBuyerChatThreads(); else renderSellerChatThreads();
  } catch(e) { toast('Error opening chat: ' + e.message, 'e'); console.error(e); }
}

async function renderChatMessages(role, threadId) {
  const isB    = role === 'buyer';
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
    const editedTag = m.edited ? ' <span style="font-size:9px;opacity:.6">(edited)</span>' : '';
    const actions = isOut ? `<div style="display:flex;gap:6px;margin-top:5px;justify-content:flex-end">
      <button onclick="editMsg(${m.id},'${m.text.replace(/'/g,"\\'")}','${role}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,.7)">✏️</button>
      <button onclick="deleteMsg(${m.id},'${role}')" style="background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,.7)">🗑️</button>
    </div>` : '';
    return `${dateDivider}<div class="chat-msg ${isOut ? 'out' : 'in'}">${m.text}${editedTag}<div class="chat-msg-time">${timeStr}</div>${actions}</div>`;
  }).join('');
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

let editingMsgId = null;

async function sendMsg(role) {
  const isB  = role === 'buyer';
  const inp  = document.getElementById((isB ? 'b' : 's') + '-chat-msg');
  const text = inp.value.trim();
  if (!text || !activeChatThread) return;

  if (editingMsgId) {
    // Editing existing message
    const { error } = await sb.from('messages').update({ text, edited: true }).eq('id', editingMsgId);
    if (error) { toast('Edit failed', 'e'); return; }
    editingMsgId = null;
    inp.value = '';
    inp.placeholder = 'Type a message...';
    const sendBtn = document.getElementById((isB?'b':'s') + '-send-btn');
    if (sendBtn) sendBtn.textContent = '➤';
    await renderChatMessages(role, activeChatThread);
    return;
  }

  const { error } = await sb.from('messages').insert([{
    thread_id: activeChatThread, from_role: isB ? 'buyer' : 'seller', text, time: Date.now()
  }]);
  if (error) { toast('Message failed', 'e'); return; }
  inp.value = '';
  await renderChatMessages(role, activeChatThread);
}

async function editMsg(msgId, oldText, role) {
  const isB = role === 'buyer';
  editingMsgId = msgId;
  const inp = document.getElementById((isB ? 'b' : 's') + '-chat-msg');
  if (inp) { inp.value = oldText; inp.placeholder = 'Editing message...'; inp.focus(); }
  const sendBtn = document.getElementById((isB?'b':'s') + '-send-btn');
  if (sendBtn) sendBtn.textContent = '✏️';
}

async function deleteMsg(msgId, role) {
  if (!confirm('Delete this message?')) return;
  const { error } = await sb.from('messages').delete().eq('id', msgId);
  if (error) { toast('Delete failed', 'e'); return; }
  await renderChatMessages(role, activeChatThread);
  toast('Message deleted');
}

// ============================================================
//  ADMIN
// ============================================================

// ============================================================
//  ADMIN — BUYER / SELLER DRILL-DOWN
// ============================================================
let _allOrders = [], _allProds = [], _allUsers = [];
let _sdSellerId = null;

async function openBuyerDetail(buyerId) {
  const buyer  = _allUsers.find(u => u.id === buyerId); if (!buyer) return;
  const orders = _allOrders.filter(o => o.buyerId === buyerId);
  const delivered = orders.filter(o => o.status === 'delivered').length;
  const spent = orders.reduce((s, o) => s + o.amount, 0);

  document.getElementById('bd-ava').textContent  = buyer.name[0].toUpperCase();
  document.getElementById('bd-name').textContent = buyer.name;
  document.getElementById('bd-meta').textContent = buyer.email + ' · ' + (buyer.phone || 'N/A') + ' · ' + (buyer.country || 'N/A') + ' · Joined ' + (buyer.joined || 'N/A');
  document.getElementById('bd-verified').textContent = buyer.verified ? '✅ Verified' : '⚠️ Unverified';
  document.getElementById('bd-total-orders').textContent = orders.length;
  document.getElementById('bd-total-spent').textContent  = 'GHS ' + (spent * 15).toFixed(2);
  document.getElementById('bd-delivered').textContent    = delivered;

  const el = document.getElementById('bd-orders');
  if (!orders.length) {
    el.innerHTML = '<div class="es"><div class="es-icon">📦</div><h4>No orders yet</h4></div>';
  } else {
    el.innerHTML = orders.map(o => {
      const p = _allProds.find(x => x.id === o.productId);
      return `<div class="lr" style="padding:12px 8px">
        <div class="lthumb" style="overflow:hidden;flex-shrink:0">${p ? prodImg(p,46) : '<span style="font-size:20px">' + o.productEmoji + '</span>'}</div>
        <div class="linfo">
          <div class="ltitle">${o.productName} × ${o.qty}</div>
          <div class="lsub">${o.id} · ${o.date} · via ${o.payment}</div>
          <div class="lsub">Seller: ${o.sellerName} · Ships to: ${o.buyerAddress}</div>
        </div>
        <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
        <div class="lprice">GHS ${o.amount.toFixed(2)}</div>
      </div>`;
    }).join('');
  }
  document.getElementById('buyer-detail-modal').classList.add('open');
}

async function openSellerDetail(sellerId) {
  _sdSellerId = sellerId;
  const seller = _allUsers.find(u => u.id === sellerId); if (!seller) return;
  const orders = _allOrders.filter(o => o.sellerId === sellerId);
  const prods  = _allProds.filter(p => p.sellerId === sellerId);
  const rev    = orders.reduce((s, o) => s + o.amount, 0);
  const comm   = rev * (currentCommission / 100);

  document.getElementById('sd-ava').textContent      = seller.name[0].toUpperCase();
  document.getElementById('sd-name').textContent     = seller.name;
  document.getElementById('sd-meta').textContent     = seller.email + ' · ' + (seller.phone || 'N/A') + ' · ' + (seller.country || 'N/A') + ' · Joined ' + (seller.joined || 'N/A');
  document.getElementById('sd-category').textContent = seller.category || 'General';
  document.getElementById('sd-total-prods').textContent  = prods.length;
  document.getElementById('sd-total-orders').textContent = orders.length;
  document.getElementById('sd-revenue').textContent      = 'GHS ' + rev.toFixed(2);
  document.getElementById('sd-commission').textContent   = 'GHS ' + (comm * 15).toFixed(2);

  // Reset tabs
  document.getElementById('sd-tab-orders').classList.add('on');
  document.getElementById('sd-tab-products').classList.remove('on');
  document.getElementById('sd-orders-panel').style.display   = 'block';
  document.getElementById('sd-products-panel').style.display = 'none';

  // Render orders
  const ordEl = document.getElementById('sd-orders-panel');
  ordEl.innerHTML = orders.length
    ? orders.map(o => `<div class="lr" style="padding:12px 8px">
        <div class="lthumb">${o.productEmoji}</div>
        <div class="linfo">
          <div class="ltitle">${o.buyerName} ordered ${o.productName} × ${o.qty}</div>
          <div class="lsub">${o.id} · ${o.date} · ${o.buyerEmail} · ${o.buyerPhone}</div>
          <div class="lsub">Ships to: ${o.buyerAddress}, ${o.buyerCountry} · via ${o.payment}</div>
        </div>
        <span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
        <div class="lprice">GHS ${o.amount.toFixed(2)}</div>
      </div>`).join('')
    : '<div class="es"><div class="es-icon">📭</div><h4>No orders yet</h4></div>';

  // Render products
  const prodEl = document.getElementById('sd-products-panel');
  prodEl.innerHTML = prods.length
    ? prods.map(p => `<div class="lr" style="padding:12px 8px">
        <div class="lthumb" style="overflow:hidden">${prodImg(p, 46)}</div>
        <div class="linfo">
          <div class="ltitle">${p.name}</div>
          <div class="lsub">${p.category} · ${p.country} · ${p.desc || ''}</div>
        </div>
        <span class="bdg live">Live</span>
        <div class="lprice">GHS ${p.price.toFixed(2)}</div>
      </div>`).join('')
    : '<div class="es"><div class="es-icon">📦</div><h4>No products listed</h4></div>';

  document.getElementById('seller-detail-modal').classList.add('open');
}

function sdTab(tab) {
  document.getElementById('sd-tab-orders').classList.toggle('on', tab === 'orders');
  document.getElementById('sd-tab-products').classList.toggle('on', tab === 'products');
  document.getElementById('sd-orders-panel').style.display   = tab === 'orders'   ? 'block' : 'none';
  document.getElementById('sd-products-panel').style.display = tab === 'products' ? 'block' : 'none';
}

async function initAdmin() { await loadCommission(); await refreshAdmin(); }

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
  set('a-rev',  'GHS ' + rev.toFixed(2));
  const commEarned  = rev * 15 * (currentCommission / 100);
  const sellerPay   = rev - commEarned;
  set('a-comm-total',   'GHS ' + commEarned.toFixed(2));
  set('a-comm-payouts', 'GHS ' + sellerPay.toFixed(2));
  set('a-comm-rate',    currentCommission + '%');
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
         <div class="lprice">GHS ${o.amount.toFixed(2)}</div><div class="larrow">›</div></div>`).join('')
    : '<div class="es"><div class="es-icon">🧾</div><h4>No orders yet</h4></div>';

  const tbody = document.getElementById('a-ord-tbody');
  if (tbody) tbody.innerHTML = orders.length
    ? orders.map(o =>
        `<tr><td style="font-weight:700;color:var(--teal-dark)">${o.id}</td><td style="font-weight:700">${o.buyerName}</td>
         <td>${o.buyerEmail}</td><td>${o.buyerPhone}</td><td>${o.productEmoji} ${o.productName}</td>
         <td>${o.qty}</td><td style="font-weight:800;color:var(--teal-dark)">GHS ${o.amount.toFixed(2)}</td>
         <td>${o.buyerCountry}</td><td>${o.buyerAddress}</td><td>${o.payment}</td>
         <td>${o.sellerName}</td><td>${o.date}</td>
         <td><span class="bdg ${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span></td></tr>`).join('')
    : `<tr><td colspan="13"><div class="es"><div class="es-icon">🧾</div><h4>No orders yet</h4></div></td></tr>`;

  const apl = document.getElementById('a-prod-list');
  if (apl) apl.innerHTML = prods.length
    ? prods.map(p =>
        `<div class="lr"><div class="lthumb">${p.emoji}</div>
         <div class="linfo"><div class="ltitle">${p.name}</div><div class="lsub">${p.seller} · ${p.category} · ${p.country}</div></div>
         <span class="bdg live">${p.category}</span>
         <div class="lprice">GHS ${p.price.toFixed(2)}</div>
         <button class="del-btn" onclick="adminRemoveListing('` + p.id + `','` + p.name.replace(/'/g,'') + `')">🗑️ Remove</button></div>`).join('')
    : '<div class="es"><div class="es-icon">📦</div><h4>No products yet</h4></div>';

  const abl = document.getElementById('a-buy-list');
  if (abl) abl.innerHTML = buyers.length
    ? buyers.map(b => {
        const os = orders.filter(o => o.buyerId === b.id);
        return '<div class="lr" onclick="openBuyerDetail('' + b.id + '')" style="cursor:pointer">'
          + '<div class="lthumb" style="font-weight:800;font-size:16px;color:var(--teal-dark)">' + b.name[0] + '</div>'
          + '<div class="linfo"><div class="ltitle">' + b.name + '</div>'
          + '<div class="lsub">' + b.email + ' · ' + (b.phone||'N/A') + ' · ' + (b.country||'N/A') + ' · Joined ' + (b.joined||'N/A') + '</div></div>'
          + '<span class="bdg live">' + os.length + ' orders</span>'
          + '<div class="lprice">GHS ' + os.reduce((s,o)=>s+o.amount,0).toFixed(2) + '</div>'
          + '<div class="larrow">›</div></div>';
      }).join('')
    : '<div class="es"><div class="es-icon">🛍️</div><h4>No buyers yet</h4></div>';

  const asl = document.getElementById('a-sel-list');
  if (asl) asl.innerHTML = sellers.length
    ? sellers.map(s => {
        const ps = prods.filter(p => p.sellerId === s.id).length;
        const os = orders.filter(o => o.sellerId === s.id);
        return `<div class="lr" onclick="openSellerDetail('${s.id}')" style="cursor:pointer">
          <div class="lthumb" style="font-weight:800;font-size:16px;color:var(--teal-dark)">${s.name[0]}</div>
          <div class="linfo"><div class="ltitle">${s.name}</div>
          <div class="lsub">${s.email} · ${s.phone || 'N/A'} · ${s.country||'N/A'} · ${s.category||'General'} · Joined ${s.joined||'N/A'}</div></div>
          <span class="bdg live">${ps} products</span>
          <div class="lprice">GHS ${os.reduce((sum,o)=>sum+o.amount,0).toFixed(2)}</div>
          <div class="larrow">›</div></div>`;
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

// ---- STARTUP — show correct screen ----
function startApp() {
  ['role-select','auth-screen','buyer-portal','seller-portal','admin-portal']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  if (window.location.hash === '#admin') {
    goAuth('admin');
  } else {
    const rs = document.getElementById('role-select');
    if (rs) rs.style.display = 'flex';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

window.addEventListener('hashchange', function () {
  if (window.location.hash === '#admin' && !DB.currentUser) {
    ['buyer-portal','seller-portal','admin-portal','auth-screen','role-select']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    goAuth('admin');
  }
});

// ============================================================
//  FORGOT PASSWORD
// ============================================================
async function sendResetCode() {
  const email = document.getElementById('forgot-email')?.value?.trim();
  if (!email) { toast('Please enter your email address', 'e'); return; }
  const { data, error } = await sb.from('users').select('id,name,email').eq('email', email);
  if (error || !data || !data.length) { toast('No account found with that email', 'e'); return; }
  const user  = data[0];
  const otp   = generateOTP();
  const exp   = Date.now() + 10 * 60 * 1000;
  await sb.from('users').update({ otp, otp_expires: exp }).eq('id', user.id);
  const sent = await sendOTPEmail(email, otp, user.name);
  if (!sent) toast(otp + ': Reset code (check email or use this)', 'otp');
  else toast('Reset code sent to ' + email + ' — also: ' + otp, 'otp');
  document.getElementById('forgot-otp-section').style.display = 'block';
  document.getElementById('forgot-email').dataset.userId = user.id;
}

async function confirmResetPassword() {
  const otp     = document.getElementById('forgot-otp-inp')?.value?.trim();
  const newPass = document.getElementById('forgot-new-pass')?.value?.trim();
  const userId  = document.getElementById('forgot-email')?.dataset?.userId;
  if (!otp || otp.length !== 6) { toast('Enter the 6-digit code', 'e'); return; }
  if (!newPass || newPass.length < 6) { toast('Password must be at least 6 characters', 'e'); return; }
  if (!userId) { toast('Session expired — try again', 'e'); return; }
  const { data } = await sb.from('users').select('otp,otp_expires').eq('id', userId).single();
  if (!data) { toast('User not found', 'e'); return; }
  if (Date.now() > data.otp_expires) { toast('Code expired — request a new one', 'e'); return; }
  if (otp !== data.otp) { toast('Incorrect code', 'e'); return; }
  const { error } = await sb.from('users').update({ password: newPass, otp: null, otp_expires: null }).eq('id', userId);
  if (error) { toast('Reset failed: ' + error.message, 'e'); return; }
  document.getElementById('forgot-modal').classList.remove('open');
  document.getElementById('forgot-otp-section').style.display = 'none';
  document.getElementById('forgot-otp-inp').value = '';
  document.getElementById('forgot-new-pass').value = '';
  toast('Password reset successfully! Please log in ✓');
}

// ============================================================
//  LISTING TYPE TOGGLE (Product vs Service)
// ============================================================
function switchListingType(type) {
  const typeEl = document.getElementById('ap-type');
  if (typeEl) typeEl.value = type;
  const prodBtn = document.getElementById('type-product-btn');
  const svcBtn  = document.getElementById('type-service-btn');
  if (prodBtn) { prodBtn.classList.toggle('on', type === 'product'); }
  if (svcBtn)  { svcBtn.classList.toggle('on', type === 'service'); }
  const prodFields = document.getElementById('ap-product-fields');
  const svcFields  = document.getElementById('ap-service-fields');
  const detSection = document.getElementById('ap-details-section');
  if (prodFields) prodFields.style.display = type === 'product' ? 'block' : 'none';
  if (svcFields)  svcFields.style.display  = type === 'service' ? 'block' : 'none';
  if (detSection) detSection.style.display = type === 'product' ? 'block' : 'none';
  const nameLabel  = document.getElementById('ap-name-lbl');
  const priceLabel = document.getElementById('ap-price-label');
  const submitBtn  = document.getElementById('ap-submit-btn');
  const modalTitle = document.getElementById('ap-modal-title');
  const modalSub   = document.getElementById('ap-modal-sub');
  const isEditing  = document.getElementById('ap-type')?.dataset?.editing;
  if (type === 'service') {
    if (nameLabel)  nameLabel.textContent  = 'Service Name';
    if (priceLabel) priceLabel.textContent = 'Price (GHS)';
    if (submitBtn)  submitBtn.textContent  = 'List Service →';
    if (modalTitle && !isEditing) modalTitle.textContent = '🛠️ Add Service';
    if (modalSub)   modalSub.textContent   = 'Offer your skill or service on FaithTrade';
  } else {
    if (nameLabel)  nameLabel.textContent  = 'Product Name';
    if (priceLabel) priceLabel.textContent = 'Price (GHS)';
    if (submitBtn)  submitBtn.textContent  = 'List Product →';
    if (modalTitle && !isEditing) modalTitle.textContent = '➕ New Listing';
    if (modalSub)   modalSub.textContent   = 'Add a product or service to FaithTrade';
  }
}

// ============================================================
//  IMAGE TAB SWITCH (Upload vs URL)
// ============================================================
function switchImgTab(tab) {
  const uploadPanel = document.getElementById('img-panel-upload');
  const urlPanel    = document.getElementById('img-panel-url');
  const uploadBtn   = document.getElementById('img-tab-upload');
  const urlBtn      = document.getElementById('img-tab-url');
  if (!uploadPanel) return;
  if (tab === 'url') {
    uploadPanel.style.display  = 'none';
    urlPanel.style.display     = 'block';
    if (uploadBtn) { uploadBtn.style.background='white'; uploadBtn.style.color='var(--text-muted)'; uploadBtn.style.borderColor='var(--border-mid)'; }
    if (urlBtn)    { urlBtn.style.background='var(--teal)'; urlBtn.style.color='white'; urlBtn.style.borderColor='var(--teal)'; }
  } else {
    uploadPanel.style.display  = 'block';
    urlPanel.style.display     = 'none';
    if (urlBtn)    { urlBtn.style.background='white'; urlBtn.style.color='var(--text-muted)'; urlBtn.style.borderColor='var(--border-mid)'; }
    if (uploadBtn) { uploadBtn.style.background='var(--teal)'; uploadBtn.style.color='white'; uploadBtn.style.borderColor='var(--teal)'; }
  }
}

function previewImgUrl(url) {
  const preview = document.getElementById('ap-url-preview');
  const img     = document.getElementById('ap-url-img');
  const errorEl = document.getElementById('ap-url-error');
  if (!url || !url.startsWith('http')) { if (preview) preview.style.display = 'none'; return; }
  img.onload  = () => {
    if (preview) preview.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    currentImgData = url;
  };
  img.onerror = () => {
    if (preview) preview.style.display = 'none';
    if (errorEl) errorEl.style.display = 'block';
    currentImgData = null;
  };
  img.src = url;
}

// ============================================================
//  ADMIN GLOBAL SEARCH
// ============================================================
function adminSearch(q) {
  q = (q || '').toLowerCase().trim();
  if (!q) { refreshAdmin(); return; }
  const results = [
    ..._allOrders.filter(o =>
      (o.id||'').toLowerCase().includes(q) ||
      (o.buyerName||'').toLowerCase().includes(q) ||
      (o.productName||'').toLowerCase().includes(q) ||
      (o.sellerName||'').toLowerCase().includes(q)
    ).map(o => ({ type:'order', data:o })),
    ..._allUsers.filter(u =>
      (u.name||'').toLowerCase().includes(q) ||
      (u.email||'').toLowerCase().includes(q) ||
      (u.phone||'').includes(q)
    ).map(u => ({ type:'user', data:u })),
    ..._allProds.filter(p =>
      (p.name||'').toLowerCase().includes(q) ||
      (p.seller||'').toLowerCase().includes(q) ||
      (p.category||'').toLowerCase().includes(q)
    ).map(p => ({ type:'product', data:p })),
  ];
  ['overview','orders','products','buyers','sellers','messages','feed','promotions','settings']
    .forEach(p => { const e = document.getElementById('a-'+p); if(e) e.classList.remove('on'); });
  document.getElementById('a-overview')?.classList.add('on');
  document.getElementById('a-ticon').textContent  = '🔍';
  document.getElementById('a-ttitle').textContent = 'Search Results (' + results.length + ')';
  const lat = document.getElementById('a-latest');
  if (!lat) return;
  if (!results.length) { lat.innerHTML = '<div class="es"><div class="es-icon">🔍</div><h4>No results for "' + q + '"</h4></div>'; return; }
  lat.innerHTML = results.map(r => {
    if (r.type === 'order') {
      const o = r.data;
      return `<div class="lr"><div class="lthumb">${o.productEmoji||'📦'}</div>
        <div class="linfo"><div class="ltitle">🧾 ${o.buyerName} → ${o.productName}</div>
        <div class="lsub">${o.id} · ${o.date} · GHS ${o.amount.toFixed(2)}</div></div>
        <span class="bdg ${o.status}">${o.status}</span></div>`;
    }
    if (r.type === 'user') {
      const u = r.data;
      return `<div class="lr"><div class="lthumb" style="font-weight:800;font-size:15px;color:var(--teal-dark)">${(u.name||'?')[0]}</div>
        <div class="linfo"><div class="ltitle">${u.role==='buyer'?'🛍️':'🏪'} ${u.name}</div>
        <div class="lsub">${u.email} · ${u.phone||'N/A'}</div></div>
        <span class="bdg live">${u.role}</span></div>`;
    }
    if (r.type === 'product') {
      const p = r.data;
      return `<div class="lr"><div class="lthumb">${p.emoji||'📦'}</div>
        <div class="linfo"><div class="ltitle">📦 ${p.name}</div>
        <div class="lsub">${p.seller} · ${p.category}</div></div>
        <div class="lprice">GHS ${p.price.toFixed(2)}</div></div>`;
    }
    return '';
  }).join('');
}

// ============================================================
//  ADMIN MESSAGES
// ============================================================
async function loadAdminMessages() {
  const el = document.getElementById('a-msg-list');
  if (!el) return;
  el.innerHTML = '<div class="es"><div class="es-icon">⏳</div><h4>Loading...</h4></div>';
  try {
    const { data: threads } = await sb.from('threads').select('*');
    if (!threads || !threads.length) {
      el.innerHTML = '<div class="es"><div class="es-icon">💬</div><h4>No conversations yet</h4></div>'; return;
    }
    const { data: msgs } = await sb.from('messages').select('thread_id');
    const counts = {};
    (msgs||[]).forEach(m => { counts[m.thread_id] = (counts[m.thread_id]||0) + 1; });
    el.innerHTML = threads.map(t => `
      <div class="lr" onclick="openAdminThread('${t.id}')" style="cursor:pointer">
        <div class="lthumb" style="font-size:22px">💬</div>
        <div class="linfo">
          <div class="ltitle">${t.buyer_name} ↔ ${t.seller_name}</div>
          <div class="lsub">Thread: ${t.id} · ${counts[t.id]||0} messages</div>
        </div>
        <span class="bdg live">${counts[t.id]||0} msgs</span>
        <div class="larrow">›</div>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div class="es"><div class="es-icon">❌</div><h4>Error loading messages</h4></div>'; }
}

async function openAdminThread(threadId) {
  try {
    const { data: msgs }   = await sb.from('messages').select('*').eq('thread_id', threadId).order('time', { ascending: true });
    const { data: thread } = await sb.from('threads').select('*').eq('id', threadId).single();
    if (!thread) return;
    document.getElementById('admin-thread-modal').classList.add('open');
    document.getElementById('atm-title').textContent = thread.buyer_name + ' ↔ ' + thread.seller_name;
    const body = document.getElementById('atm-body');
    if (!msgs || !msgs.length) {
      body.innerHTML = '<div class="es"><div class="es-icon">💬</div><h4>No messages</h4></div>'; return;
    }
    body.innerHTML = msgs.map(m => {
      const isB = m.from_role === 'buyer';
      const time = new Date(m.time).toLocaleString('en-GB');
      return `<div style="margin-bottom:12px;padding:10px 14px;border-radius:10px;background:${isB?'var(--teal-soft)':'#f0f0f0'}">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px">
          ${isB?'🛍️ '+thread.buyer_name:'🏪 '+thread.seller_name} · ${time}
        </div>
        <div style="font-size:13px;color:var(--text)">${m.text}</div>
      </div>`;
    }).join('');
  } catch(e) { toast('Error opening thread: ' + e.message, 'e'); }
}

// ============================================================
//  ADMIN SETTINGS — SAVE FUNCTIONS
// ============================================================
async function loadAdminSettings() {
  try {
    const { data } = await sb.from('settings').select('*');
    if (!data) return;
    const map = {};
    data.forEach(r => map[r.key] = r.value);
    const set = (id, val) => { const e = document.getElementById(id); if (e && val) e.value = val; };
    set('s-bank-name', map.bank_name);
    set('s-acc-name',  map.bank_acc_name);
    set('s-acc-num',   map.bank_acc_num);
    set('s-branch',    map.bank_branch);
    set('s-momo-network', map.momo_network);
    set('s-momo-number',  map.momo_number);
    set('s-momo-name',    map.momo_name);
    set('s-platform-name',  map.platform_name);
    set('s-support-email',  map.support_email);
    set('s-currency',       map.currency);
    set('s-edit-window',    map.edit_window_hours);
    if (map.commission_pct) {
      currentCommission = parseFloat(map.commission_pct) || 5;
      const inp = document.getElementById('commission-input');
      if (inp) inp.value = currentCommission;
      previewCommission();
    }
  } catch(e) { console.error('Settings load error:', e); }
}

async function saveBankDetails() {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const bank = g('s-bank-name'), accName = g('s-acc-name'), accNum = g('s-acc-num'), branch = g('s-branch');
  if (!bank || !accName || !accNum) { toast('Fill all bank fields', 'e'); return; }
  const { error } = await sb.from('settings').upsert([
    { key:'bank_name',     value:bank    },
    { key:'bank_acc_name', value:accName },
    { key:'bank_acc_num',  value:accNum  },
    { key:'bank_branch',   value:branch  },
  ]);
  if (error) { toast('Save failed: ' + error.message, 'e'); return; }
  toast('Bank details saved ✓');
}

async function saveMomoDetails() {
  const net  = document.getElementById('s-momo-network')?.value || '';
  const num  = document.getElementById('s-momo-number')?.value?.trim() || '';
  const name = document.getElementById('s-momo-name')?.value?.trim() || '';
  if (!num) { toast('Enter MoMo number', 'e'); return; }
  const { error } = await sb.from('settings').upsert([
    { key:'momo_network', value:net  },
    { key:'momo_number',  value:num  },
    { key:'momo_name',    value:name },
  ]);
  if (error) { toast('Save failed: ' + error.message, 'e'); return; }
  toast('MoMo details saved ✓');
}

async function savePlatformSettings() {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const { error } = await sb.from('settings').upsert([
    { key:'platform_name',      value: g('s-platform-name')  },
    { key:'support_email',      value: g('s-support-email')  },
    { key:'currency',           value: document.getElementById('s-currency')?.value || 'GHS' },
    { key:'edit_window_hours',  value: g('s-edit-window')    },
  ]);
  if (error) { toast('Save failed: ' + error.message, 'e'); return; }
  toast('Platform settings saved ✓');
}

