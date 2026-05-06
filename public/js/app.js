/* ── State ──────────────────────────────────────────── */
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let posts = [];
let viewingId = null;

/* ── Helpers ────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const esc = t => { const d = document.createElement('div'); d.appendChild(document.createTextNode(t || '')); return d.innerHTML; };
const fmtDate = s => new Date(s).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' });

function showErr(el, msg) { el.textContent = msg; show(el); }
function clearErr(el) { hide(el); el.textContent = ''; }

// Wrapper cho các API call cần auth — tự logout nếu token hết hạn
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    token = null; username = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    refreshAuthBtn();
    show($('authModal'));
    throw new Error('Session expired');
  }
  return res;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback */ }
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  document.execCommand('copy'); t.remove(); return true;
}

/* ── Auth UI ────────────────────────────────────────── */
function refreshAuthBtn() {
  const btn = $('authBtn');
  if (token && username) {
    btn.textContent = `${username} · Đăng xuất`;
    btn.style.background = 'rgba(255,255,255,0.1)';
  } else {
    btn.textContent = 'Đăng nhập';
    btn.style.background = '';
  }
}

$('authBtn').addEventListener('click', () => {
  if (token) {
    token = null; username = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    refreshAuthBtn();
    loadBlog();
  } else {
    show($('authModal'));
  }
});

/* ── Auth Modal ─────────────────────────────────────── */
$('closeAuth').addEventListener('click', () => hide($('authModal')));
$('authOverlay').addEventListener('click', () => hide($('authModal')));
$('goRegister').addEventListener('click', e => { e.preventDefault(); hide($('formLogin')); show($('formRegister')); });
$('goLogin').addEventListener('click', e => { e.preventDefault(); hide($('formRegister')); show($('formLogin')); });

$('doLogin').addEventListener('click', async () => {
  const u = $('lUser').value.trim();
  const p = $('lPass').value;
  const err = $('loginErr');
  clearErr(err);
  if (!u || !p) return showErr(err, 'Vui lòng điền đầy đủ thông tin');

  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (!r.ok) return showErr(err, d.error || 'Đăng nhập thất bại');
    token = d.token; username = d.username;
    localStorage.setItem('token', token); localStorage.setItem('username', username);
    hide($('authModal')); refreshAuthBtn(); loadBlog();
  } catch { showErr(err, 'Không thể kết nối server'); }
});

$('doRegister').addEventListener('click', async () => {
  const u = $('rUser').value.trim();
  const p = $('rPass').value;
  const err = $('registerErr');
  clearErr(err);
  if (!u || !p) return showErr(err, 'Vui lòng điền đầy đủ thông tin');

  try {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (!r.ok) return showErr(err, d.errors?.[0]?.msg || d.error || 'Đăng ký thất bại');
    token = d.token; username = d.username;
    localStorage.setItem('token', token); localStorage.setItem('username', username);
    hide($('authModal')); refreshAuthBtn(); loadBlog();
  } catch { showErr(err, 'Không thể kết nối server'); }
});

/* ── Caption Generator ──────────────────────────────── */
$('generateBtn').addEventListener('click', generate);
$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') generate(); });

const TIKTOK_RE = /^https?:\/\/(www\.|vm\.)?tiktok\.com\/.+/;

async function generate() {
  const url = $('urlInput').value.trim();
  const err = $('errorBox');
  clearErr(err);
  hide($('resultBox'));
  if (!url) return showErr(err, 'Vui lòng nhập link TikTok');
  if (!TIKTOK_RE.test(url)) return showErr(err, 'Link TikTok không hợp lệ. VD: https://www.tiktok.com/@user/video/...');

  setLoading(true);
  try {
    const r = await fetch('/api/caption/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await r.json();
    if (!r.ok) return showErr(err, d.errors?.[0]?.msg || d.error || 'Có lỗi xảy ra');
    renderResults(d.data);
    loadHistory();
  } catch { showErr(err, 'Không thể kết nối server. Vui lòng thử lại.'); }
  finally { setLoading(false); }
}

function setLoading(on) {
  $('generateBtn').disabled = on;
  on ? show($('btnLoad')) : hide($('btnLoad'));
  on ? hide($('btnText')) : show($('btnText'));
}

function renderResults(data) {
  $('captionOut').textContent = data.caption;
  $('ctaOut').textContent = data.cta;
  const tagsEl = $('tagsOut');
  tagsEl.innerHTML = '';
  (data.tags || []).forEach(t => {
    const s = document.createElement('span');
    s.className = 'tag'; s.textContent = '#' + t;
    s.addEventListener('click', async () => { await copyText('#' + t); s.style.background = 'rgba(37,244,238,.15)'; setTimeout(() => s.style.background = '', 1000); });
    tagsEl.appendChild(s);
  });
  show($('resultBox'));
}

/* Copy buttons */
document.querySelectorAll('.copy-btn[data-for]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const el = $(btn.dataset.for);
    await copyText(el.textContent);
    btn.textContent = '✓ Đã chép'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = 'Sao chép'; btn.classList.remove('done'); }, 2000);
  });
});

$('copyAllTags').addEventListener('click', async () => {
  const tags = Array.from($('tagsOut').querySelectorAll('.tag')).map(t => t.textContent).join(' ');
  await copyText(tags);
  $('copyAllTags').textContent = '✓ Đã chép'; $('copyAllTags').classList.add('done');
  setTimeout(() => { $('copyAllTags').textContent = 'Sao chép tất cả'; $('copyAllTags').classList.remove('done'); }, 2000);
});

/* ── History ────────────────────────────────────────── */
async function loadHistory() {
  if (!token) return; // history yêu cầu đăng nhập
  try {
    const r = await apiFetch('/api/caption/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await r.json();
    const list = $('historyList');
    if (!data.length) {
      list.innerHTML = '<p class="history-empty">Chưa có lịch sử</p>';
      return;
    }
    list.innerHTML = data.map(h => `
      <div class="history-item">
        <span class="history-url" title="${esc(h.video_url)}">${esc(h.video_url)}</span>
        <span class="history-cap">${esc(h.caption || '')}</span>
      </div>`).join('');
  } catch { /* silent */ }
}

/* ── Blog ───────────────────────────────────────────── */
async function loadBlog() {
  const grid = $('blogGrid');
  grid.innerHTML = '<div class="empty-state">Đang tải...</div>';
  try {
    const r = await fetch('/api/blog');
    posts = await r.json();
    if (!posts.length) {
      grid.innerHTML = '<div class="empty-state">Chưa có bài viết nào. Hãy là người đầu tiên viết!</div>';
      return;
    }
    grid.innerHTML = posts.map(p => `
      <div class="blog-card" data-slug="${esc(p.slug)}">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.content)}</p>
        <div class="post-meta">${esc(p.author || 'Ẩn danh')} · ${fmtDate(p.created_at)}</div>
      </div>`).join('');
    document.querySelectorAll('.blog-card').forEach(c => {
      c.addEventListener('click', () => openPost(c.dataset.slug));
    });
  } catch { grid.innerHTML = '<div class="empty-state">Không thể tải bài viết</div>'; }
}

function openPost(slug) {
  const p = posts.find(x => x.slug === slug);
  if (!p) return;
  viewingId = p.id;
  $('viewTitle').textContent = p.title;
  $('viewMeta').textContent = `${p.author || 'Ẩn danh'} · ${fmtDate(p.created_at)}`;
  $('viewBody').textContent = p.content;
  token && username === p.author ? show($('viewActions')) : hide($('viewActions'));
  show($('viewModal'));
}

/* Write/Edit post */
$('newPostBtn').addEventListener('click', () => {
  if (!token) { show($('authModal')); return; }
  $('postModalLabel').textContent = 'Viết bài mới';
  $('editId').value = '';
  $('postTitle').value = '';
  $('postContent').value = '';
  clearErr($('postErr'));
  show($('postModal'));
});

$('submitPost').addEventListener('click', async () => {
  const title = $('postTitle').value.trim();
  const content = $('postContent').value.trim();
  const editId = $('editId').value;
  const err = $('postErr');
  clearErr(err);
  if (!title || !content) return showErr(err, 'Vui lòng điền tiêu đề và nội dung');

  try {
    const r = await apiFetch(editId ? `/api/blog/${editId}` : '/api/blog', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title, content })
    });
    const d = await r.json();
    if (!r.ok) return showErr(err, d.errors?.[0]?.msg || d.error || 'Có lỗi xảy ra');
    hide($('postModal')); hide($('viewModal')); loadBlog();
  } catch { showErr(err, 'Không thể kết nối server'); }
});

$('editBtn').addEventListener('click', () => {
  const p = posts.find(x => x.id === viewingId);
  if (!p) return;
  $('postModalLabel').textContent = 'Chỉnh sửa bài viết';
  $('editId').value = p.id;
  $('postTitle').value = p.title;
  $('postContent').value = p.content;
  clearErr($('postErr'));
  hide($('viewModal')); show($('postModal'));
});

$('deleteBtn').addEventListener('click', async () => {
  if (!confirm('Xóa bài viết này?')) return;
  try {
    await apiFetch(`/api/blog/${viewingId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    hide($('viewModal')); loadBlog();
  } catch (e) { if (e.message !== 'Session expired') alert('Không thể xóa'); }
});

/* Modal close */
$('closePost').addEventListener('click', () => hide($('postModal')));
$('cancelPost').addEventListener('click', () => hide($('postModal')));
$('postOverlay').addEventListener('click', () => hide($('postModal')));
$('closeView').addEventListener('click', () => hide($('viewModal')));
$('viewOverlay').addEventListener('click', () => hide($('viewModal')));

/* ── Init ───────────────────────────────────────────── */
// Escape key đóng mọi modal
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['authModal', 'postModal', 'viewModal'].forEach(id => hide($(id)));
});

refreshAuthBtn();
loadBlog();
loadHistory();
