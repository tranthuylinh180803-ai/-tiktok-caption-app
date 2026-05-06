# Kế hoạch: TikTok Caption App — Full-Stack Production

## Context

Demo hiện tại hoạt động đúng luồng nhưng dùng JSON file store (không an toàn khi concurrent write) và chưa có hạ tầng thật. Kế hoạch này nâng cấp lên stack production:
- **Database**: PostgreSQL (thay JSON file store)
- **Deployment**: Railway (auto-deploy từ GitHub)
- **Source Control**: GitHub + GitHub Actions CI
- **Frontend & Security**: Giữ nguyên + fix lỗ hổng nhỏ

---

## Kiến trúc Target

```
GitHub repo (main branch)
    │── push → GitHub Actions CI (install + syntax check)
    │── push → Railway auto-deploy
                    │── Node.js app (Express)
                    └── PostgreSQL plugin (Railway managed)
```

---

## Đánh Giá Tính Khả Thi Demo Hiện Tại

| Tiêu chí | Trạng thái | Vấn đề |
|---|---|---|
| Frontend UI | ✅ Khả thi | CSS/HTML hoàn chỉnh, responsive |
| Backend API | ⚠️ Cần fix | Logic đúng nhưng có lỗ hổng bảo mật |
| Database | ❌ Không khả thi | JSON file: race condition khi concurrent write |
| Security | ⚠️ Cần fix | History endpoint public, CSP unsafe-inline |
| Deployment | ❌ Chưa có | Chỉ local, chưa lên cloud |
| Source Control | ⚠️ Thiếu | Không có CI, .gitignore thiếu entries |

---

## Các Vấn Đề Cần Fix

### CRITICAL

| # | Vấn đề | Fix |
|---|--------|-----|
| C1 | JSON file store → race condition khi concurrent write | Chuyển sang PostgreSQL (`pg` package) |
| C2 | `GET /api/caption/history` PUBLIC — lộ data mọi user | Thêm `authenticate`, query theo `user_id` |
| C3 | Frontend không handle JWT hết hạn (401) | `apiFetch()` wrapper bắt 401 → auto logout + mở login modal |

### HIGH — DevOps

| # | Vấn đề | Fix |
|---|--------|-----|
| H1 | Chưa có Railway config | Tạo `railway.toml` |
| H2 | Chưa có CI pipeline | Tạo `.github/workflows/ci.yml` |
| H3 | Thiếu `.dockerignore` | `.env` bị copy vào Docker image |
| H4 | `.gitignore` thiếu entries | Thêm `.env.*`, `data/`, `.vscode/` |
| H5 | `.env.example` sơ sài | Thêm `DATABASE_URL`, `NODE_ENV`, comments hướng dẫn |

### MEDIUM — Security & UX

| # | Vấn đề | Fix |
|---|--------|-----|
| M1 | CSP `unsafe-inline` script | Bỏ — không có inline script trong HTML |
| M2 | Không validate TikTok URL client-side | Thêm regex trước khi gửi request |
| M3 | Escape key không đóng modal | Thêm `keydown` handler |

---

## Kế Hoạch Thực Hiện — 11 File

| # | File | Loại thay đổi | Priority |
|---|------|---------------|----------|
| 1 | `package.json` | Thêm `pg` | Critical |
| 2 | `src/db/database.js` | Viết lại dùng PostgreSQL | Critical |
| 3 | `src/routes/caption.js` | Thêm auth /history, user_id | Critical |
| 4 | `src/routes/auth.js` | Thêm async/await cho DB calls | Critical |
| 5 | `src/routes/blog.js` | Thêm async/await cho DB calls | Critical |
| 6 | `public/js/app.js` | apiFetch(), URL validation, Escape key | Critical + Medium |
| 7 | `railway.toml` | **Tạo mới** | High |
| 8 | `.github/workflows/ci.yml` | **Tạo mới** | High |
| 9 | `.gitignore` | Bổ sung entries | High |
| 10 | `.env.example` | Mở rộng với comments | High |
| 11 | `src/server.js` | Bỏ unsafe-inline CSP, async initDB() | Medium |

---

## Chi Tiết Từng File

### 1. `package.json`

```json
"dependencies": {
  "pg": "^8.11.3"
  // ... giữ nguyên các packages còn lại
}
```

---

### 2. `src/db/database.js` — Viết lại hoàn toàn

```js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function initDB() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    author_id INTEGER REFERENCES users(id),
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    video_url TEXT NOT NULL,
    caption TEXT, cta TEXT, tags TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  console.log('Database initialized');
}

const users = {
  findByUsername: u =>
    query('SELECT * FROM users WHERE username=$1', [u]).then(r => r[0] || null),
  findById: id =>
    query('SELECT * FROM users WHERE id=$1', [id]).then(r => r[0] || null),
  create: async ({ username, password }) => {
    const r = await query(
      'INSERT INTO users(username, password) VALUES($1,$2) RETURNING *',
      [username, password]
    );
    return r[0];
  }
};

const posts = {
  all: () => query(`
    SELECT p.*, u.username AS author FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.published = TRUE ORDER BY p.created_at DESC`),
  bySlug: slug => query(`
    SELECT p.*, u.username AS author FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.slug=$1 AND p.published=TRUE`, [slug]).then(r => r[0] || null),
  byId: id =>
    query('SELECT * FROM posts WHERE id=$1', [id]).then(r => r[0] || null),
  create: async ({ title, content, slug, author_id }) => {
    const r = await query(
      'INSERT INTO posts(title,content,slug,author_id) VALUES($1,$2,$3,$4) RETURNING *',
      [title, content, slug, author_id]
    );
    return r[0];
  },
  update: (id, { title, content }) =>
    query('UPDATE posts SET title=$1,content=$2,updated_at=NOW() WHERE id=$3',
      [title, content, id]),
  remove: id => query('DELETE FROM posts WHERE id=$1', [id])
};

const history = {
  add: ({ user_id = null, video_url, caption, cta, tags }) =>
    query(
      'INSERT INTO history(user_id,video_url,caption,cta,tags) VALUES($1,$2,$3,$4,$5)',
      [user_id, video_url, caption, cta, JSON.stringify(tags)]
    ),
  recent: async (userId, limit = 10) => {
    const rows = await query(
      'SELECT * FROM history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  }
};

module.exports = { initDB, users, posts, history };
```

---

### 3. `src/routes/caption.js` — Thay đổi nhỏ

```js
// POST /generate: vẫn public, lưu user_id nếu đã đăng nhập (optional auth)
history.add({ user_id: req.user?.userId || null, video_url: url, ...result });

// GET /history: THÊM authenticate middleware
router.get('/history', authenticate, async (req, res) => {
  try {
    res.json(await history.recent(req.user.userId, 10));
  } catch {
    res.status(500).json({ error: 'Không thể tải lịch sử' });
  }
});
```

---

### 4-5. `src/routes/auth.js` & `src/routes/blog.js`

Tất cả route handlers cần thêm `async` và `await` trước các DB calls (hiện tại sync theo JSON store cũ).

---

### 6. `public/js/app.js` — 3 bổ sung

```js
// (a) Wrapper cho protected API calls — thêm trước loadHistory()
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
// Thay fetch() → apiFetch() tại: submitPost, editBtn, deleteBtn, loadHistory

// (b) Validate URL trong generate() trước khi fetch
const TIKTOK_RE = /^https?:\/\/(www\.|vm\.)?tiktok\.com\/.+/;
if (!TIKTOK_RE.test(url)) {
  return showErr($('errorBox'), 'Link TikTok không hợp lệ. VD: https://www.tiktok.com/@user/video/...');
}

// (c) Escape key đóng modal — thêm vào Init section
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['authModal', 'postModal', 'viewModal'].forEach(id => hide($(id)));
});
```

---

### 7. `railway.toml` — Tạo mới

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

Railway đọc file này để:
- Dùng Nixpacks build (tự detect Node.js, chạy `npm ci`)
- Start bằng `npm start`
- Verify deploy qua `/health` endpoint

---

### 8. `.github/workflows/ci.yml` — Tạo mới

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Syntax check
        run: |
          node --check src/server.js
          node --check src/db/database.js
          node --check src/routes/auth.js
          node --check src/routes/blog.js
          node --check src/routes/caption.js
          node --check src/middleware/auth.js
```

---

### 9. `.gitignore` — Bổ sung vào file hiện tại

```gitignore
# Thêm vào file hiện tại:
.env.*
!.env.example
.vscode/
.idea/
data/
dist/
```

---

### 10. `.env.example` — Mở rộng

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
# Railway tự inject DATABASE_URL khi thêm PostgreSQL plugin
# Local: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=caption_app postgres:16
DATABASE_URL=postgresql://user:password@localhost:5432/caption_app

# Security
# Tạo key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Độ dài tối thiểu: 32 ký tự
JWT_SECRET=change-this-to-a-long-random-string-in-production

# Claude AI (không bắt buộc — nếu thiếu sẽ dùng template thay thế)
ANTHROPIC_API_KEY=sk-ant-api03-...

# CORS — domain frontend trong production (ví dụ: https://myapp.railway.app)
ALLOWED_ORIGIN=http://localhost:3000
```

---

### 11. `src/server.js` — 2 sửa nhỏ

```js
// Bỏ 'unsafe-inline' khỏi scriptSrc:
scriptSrc: ["'self'"],  // was: ["'self'", "'unsafe-inline'"]

// initDB() bây giờ async — await khi start server:
initDB()
  .then(() => app.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
```

---

## Quy Trình Deploy lên Railway

```bash
# Bước 1: Push code lên GitHub
git init
git add .
git commit -m "feat: initial full-stack app"
git remote add origin https://github.com/<username>/tiktok-caption-app.git
git push -u origin main

# Bước 2: Railway Dashboard
# → New Project → Deploy from GitHub repo → chọn repo

# Bước 3: Thêm PostgreSQL
# → Project → + New → Database → Add PostgreSQL
# Railway tự inject DATABASE_URL vào environment

# Bước 4: Set environment variables trong Railway Dashboard
# JWT_SECRET=<generated-key>
# ANTHROPIC_API_KEY=<optional>
# ALLOWED_ORIGIN=https://<your-app>.railway.app
# NODE_ENV=production

# Bước 5: Redeploy → Railway chạy npm ci + npm start
# Kiểm tra: https://<your-app>.railway.app/health
```

---

## Verification

```bash
# LOCAL — cần PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=pass \
  -e POSTGRES_DB=caption_app \
  postgres:16

export DATABASE_URL=postgresql://postgres:pass@localhost:5432/caption_app
npm start
# → Database initialized
# → Server → http://localhost:3000

# Kiểm tra health
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}

# Kiểm tra history cần auth
curl http://localhost:3000/api/caption/history
# → {"error":"Authentication required"}

# Kiểm tra CSP không có unsafe-inline
curl -I http://localhost:3000 | grep -i content-security-policy
# → script-src 'self'  (KHÔNG có 'unsafe-inline')

# Kiểm tra đăng ký + blog post
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass1234"}' | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")

curl -X POST http://localhost:3000/api/blog \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test bài viết","content":"Nội dung thử nghiệm với PostgreSQL backend."}'
# → {"id":1,"slug":"test-bai-viet-..."}
```

---

## Kết Quả Sau Khi Hoàn Thành

| Tiêu chí | Trước | Sau |
|---|---|---|
| **Frontend** | ✅ | ✅ + URL validate, Escape key, 401 auto-logout |
| **Backend** | ⚠️ JSON file store | ✅ PostgreSQL, async, parameterized queries |
| **Deployment** | Local only | ✅ Railway cloud, auto-deploy từ GitHub push |
| **Security** | ⚠️ History public, CSP unsafe | ✅ History scoped by user, CSP fixed |
| **Source Control** | .gitignore đơn giản | ✅ GitHub repo + GitHub Actions CI |
