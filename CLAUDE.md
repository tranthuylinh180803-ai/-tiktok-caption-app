# CLAUDE.md — Hướng dẫn cho Claude Code

## Tổng quan project

**CaptionAI** là web app full-stack Node.js + Express + PostgreSQL, deploy trên Railway. Dùng Claude Haiku để tạo caption TikTok tự động.

- **Live URL:** https://tiktok-app-production-4d5b.up.railway.app
- **GitHub:** https://github.com/tranthuylinh180803-ai/-tiktok-caption-app
- **Database:** Neon PostgreSQL (serverless, free tier)

## Cấu trúc và vai trò từng file

```
src/server.js           Entry point — Express app, middleware, routes mount
src/db/database.js      PostgreSQL Pool, schema init, query helpers (users/posts/history)
src/routes/auth.js      Đăng ký / đăng nhập — bcrypt hash, JWT sign
src/routes/caption.js   POST /generate (Claude AI), GET /history (auth required)
src/routes/blog.js      CRUD bài viết — public read, auth write
src/middleware/auth.js  JWT verify middleware — gán req.user
public/js/app.js        Frontend SPA — fetch API, modal UI, copy helpers
```

## Quy tắc quan trọng

- **Database:** Luôn dùng parameterized queries (`$1, $2`) — không bao giờ nối chuỗi SQL
- **Auth:** Route `/api/caption/history` và mọi write route blog bắt buộc có `authenticate` middleware
- **SSL:** `database.js` tự append `?sslmode=require` nếu URL chưa có — không sửa logic này
- **Port:** Railway inject `PORT` env var — server dùng `process.env.PORT || 3000`
- **Trust proxy:** `app.set('trust proxy', 1)` bắt buộc cho Railway reverse proxy (rate limiting)

## Environment variables cần thiết

```
DATABASE_URL     postgresql://...@neon.tech/neondb?sslmode=require
JWT_SECRET       chuỗi ngẫu nhiên 32+ ký tự
ANTHROPIC_API_KEY  sk-ant-... (tùy chọn — nếu thiếu dùng template)
PORT             Railway inject tự động
ALLOWED_ORIGIN   https://tiktok-app-production-4d5b.up.railway.app
```

## Chạy local

```bash
npm install
cp .env.example .env   # điền DATABASE_URL local
npm start
```

## Deploy

Push lên `main` branch → Railway auto-deploy qua Nixpacks (cấu hình trong `railway.toml`).

## Các điểm cần lưu ý khi sửa code

- `initDB()` chạy sau `app.listen()` để healthcheck không bị timeout khi DB chậm
- `history.add()` lưu `user_id = null` nếu user chưa đăng nhập (optional auth trên /generate)
- `tags` được lưu dạng JSON string trong DB, parse lại khi đọc
- Blog slug tự động sinh từ title + timestamp để tránh trùng
- Frontend dùng `apiFetch()` wrapper để auto-logout khi token hết hạn (401)
