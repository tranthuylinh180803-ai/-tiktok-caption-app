# CaptionAI — Tự động tạo caption TikTok

Web app full-stack giúp content creator tự động tạo caption, CTA và hashtag từ link video TikTok bằng Claude AI.

**Live demo:** https://tiktok-app-production-4d5b.up.railway.app

---

## Tính năng

- **Tạo caption tự động** — Dán link TikTok, nhận ngay caption tiếng Việt hấp dẫn + CTA + 6-8 hashtag
- **Lịch sử caption** — Lưu lại các video đã xử lý (yêu cầu đăng nhập)
- **Blog** — Viết và đọc bài về content marketing & TikTok
- **Tài khoản** — Đăng ký / đăng nhập, JWT authentication

## Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| Frontend | HTML + CSS + Vanilla JS |
| Backend | Node.js + Express |
| Database | PostgreSQL (Neon) |
| AI | Claude Haiku (Anthropic) |
| Deploy | Railway |
| Auth | JWT + bcrypt |
| Security | Helmet, CORS, Rate Limiting, CSP |

## Cấu trúc project

```
tiktok-caption-app/
├── src/
│   ├── server.js           # Entry point, middleware
│   ├── db/database.js      # PostgreSQL pool, schema, queries
│   ├── routes/
│   │   ├── auth.js         # POST /register, POST /login
│   │   ├── caption.js      # POST /generate, GET /history
│   │   └── blog.js         # CRUD bài viết
│   └── middleware/auth.js  # JWT authenticate middleware
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── railway.toml
├── PLAN.md
├── CLAUDE.md
└── README.md
```

## Chạy local

**Yêu cầu:** Node.js 18+, PostgreSQL 14+

```bash
# 1. Clone repo
git clone https://github.com/tranthuylinh180803-ai/-tiktok-caption-app.git
cd tiktok-caption-app

# 2. Cài dependencies
npm install

# 3. Tạo file .env
cp .env.example .env
# Điền DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY (tùy chọn)

# 4. Chạy server
npm start
# → http://localhost:3000
```

**Hoặc dùng Docker:**
```bash
docker compose up -d
```

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Chuỗi ngẫu nhiên 32+ ký tự |
| `ANTHROPIC_API_KEY` | ❌ | Claude AI key — nếu thiếu dùng template |
| `PORT` | ❌ | Mặc định 3000 |
| `ALLOWED_ORIGIN` | ❌ | CORS origin, mặc định localhost |

## API Endpoints

```
POST /api/auth/register    Đăng ký tài khoản
POST /api/auth/login       Đăng nhập

POST /api/caption/generate Tạo caption từ link TikTok (public)
GET  /api/caption/history  Lịch sử caption của user (cần token)

GET  /api/blog             Danh sách bài viết
GET  /api/blog/:slug       Chi tiết bài viết
POST /api/blog             Tạo bài viết (cần token)
PUT  /api/blog/:id         Sửa bài viết (cần token, chỉ tác giả)
DELETE /api/blog/:id       Xóa bài viết (cần token, chỉ tác giả)

GET  /health               Health check
```

## Deploy lên Railway

1. Fork repo này lên GitHub
2. Vào [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Thêm PostgreSQL plugin hoặc dùng Neon external database
4. Set environment variables: `JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`
5. Railway tự build và deploy qua Nixpacks

---

Dự án được xây dựng bằng **Claude Code** trong khuôn khổ bài tập Marketing SEONGON.
