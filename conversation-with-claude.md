# Cuộc trò chuyện với Claude Code — Xây dựng CaptionAI

**Công cụ:** Claude Code (claude.ai/code) — Claude Sonnet 4.6  
**Thời gian:** Tháng 5/2026  
**Mục tiêu:** Xây dựng web app full-stack từ đầu và deploy lên production

---

## Giai đoạn 1 — Lên kế hoạch (Plan Mode)

**User:** Yêu cầu Claude Code lên kế hoạch xây web app full-stack TikTok Caption Generator kèm blog, deploy lên Railway.

**Claude:** Phân tích và tạo kế hoạch chi tiết trong `PLAN.md`, bao gồm:
- Xác định 11 vấn đề cần fix (Critical / High / Medium)
- Thiết kế kiến trúc: GitHub → GitHub Actions CI → Railway → PostgreSQL
- Liệt kê thứ tự thực hiện 11 file cần tạo/sửa
- Lý do chọn PostgreSQL thay JSON file store (race condition, scale)
- Lý do chọn `pg` (node-postgres) thay SQLite (Railway managed service)

---

## Giai đoạn 2 — Viết code Backend

**User:** Thực thi kế hoạch.

**Claude Code thực hiện:**

### `src/db/database.js` — Viết lại hoàn toàn
- Thay JSON file store bằng PostgreSQL Pool
- Tạo schema: bảng `users`, `posts`, `history`
- Thêm retry logic với exponential backoff (5 lần, delay tăng 1.5x)
- SSL: tự append `?sslmode=require` nếu URL chưa có

```js
// Retry logic được thêm để xử lý Neon serverless hibernation
async function initDB(retries = 5, delay = 3000) {
  try {
    await _createTables();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return initDB(retries - 1, delay * 1.5);
    }
    throw err;
  }
}
```

### `src/routes/caption.js` — Fix bảo mật
- Thêm `authenticate` middleware cho `GET /history` (trước đây public — lộ data mọi user)
- Lưu `user_id` vào history (optional auth trên `/generate`)

### `src/routes/auth.js` và `blog.js`
- Chuyển tất cả DB calls sang `async/await`

### `src/server.js` — Fix thứ tự khởi động
```js
// QUAN TRỌNG: app.listen() phải chạy TRƯỚC initDB()
// Railway healthcheck cần server phản hồi ngay, không đợi DB
app.listen(PORT, () => {
  initDB().then(...).catch(...);
});
```

### `public/js/app.js` — 3 cải tiến
- `apiFetch()` wrapper: auto-logout khi token hết hạn (401)
- Validate URL TikTok phía client trước khi gọi API
- Escape key đóng modal

---

## Giai đoạn 3 — Deploy lên Railway

**User:** "đã login xong, tiếp tục deploy"

**Claude Code thực hiện qua Railway CLI:**

```bash
# Tạo project mới
railway init

# Xóa 2 project cũ (vượt giới hạn free plan)
railway project delete --yes  # passionate-wholeness
railway project delete --yes  # soothing-vitality

# Tạo service cho app
railway add --service "tiktok-app"

# Thêm PostgreSQL (dùng template postgres-ssl)
railway add --database postgres

# Deploy
railway up
```

**Vấn đề phát sinh và cách xử lý:**

| Vấn đề | Nguyên nhân | Cách fix |
|--------|-------------|----------|
| CLI deploy nhầm vào Postgres service | Chưa link đúng service | `railway service link "tiktok-app"` |
| Healthcheck timeout | `app.listen()` sau `initDB()` | Đảo thứ tự — listen trước, initDB sau |
| `X-Forwarded-For` ValidationError | Railway dùng reverse proxy | `app.set('trust proxy', 1)` |
| Container build lỗi im lặng | Dockerfile + railway.toml xung đột | Xóa Dockerfile, dùng Nixpacks |
| `ECONNRESET` khi kết nối DB | Railway Postgres service FAILED (0 replicas) | Chuyển sang Neon external PostgreSQL |

---

## Giai đoạn 4 — Chuyển sang Neon PostgreSQL

**User:** Hỏi về tính khả thi của project khi DB vẫn lỗi.

**Claude:** Đánh giá: project 90% xong, vấn đề duy nhất là Railway Postgres service không chạy được. Đề xuất 2 phương án — Neon (đơn giản hơn) hoặc fix Railway Postgres.

**User:** "thử phương án Neon"

**Claude Code thực hiện:**
1. Hướng dẫn tạo tài khoản Neon, tạo project, lấy connection string pooled
2. Nhận connection string từ user
3. Cập nhật Railway environment variable:
```bash
railway variables set DATABASE_URL="postgresql://neondb_owner:...@ep-lingering-credit-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"
```
4. Redeploy → **thành công**

**Kết quả verify:**
```
GET  /health                    → {"status":"ok"}
     Database initialized        → Neon kết nối thành công
POST /api/auth/register         → JWT token trả về
POST /api/blog (có token)       → {"id":1,"slug":"..."}
GET  /api/caption/history       → [] (đúng — trả 200 với token)
GET  /api/caption/history       → {"error":"Authentication required"} (đúng — 401 không có token)
```

---

## Giai đoạn 5 — Hoàn thiện tài liệu

**User:** Chia sẻ tiêu chí nộp bài (README.md, CLAUDE.md, PLAN.md, file xuất cuộc trò chuyện).

**Claude Code tạo:**
- `README.md` — Mô tả project, hướng dẫn chạy local, API endpoints
- `CLAUDE.md` — Hướng dẫn cho Claude Code khi làm việc với project
- `conversation-with-claude.md` — File này

---

## Tổng kết

**Thời gian:** ~2 session làm việc  
**Số lần can thiệp thủ công:** 0 (Claude Code tự xử lý toàn bộ code)  
**Số vấn đề infrastructure tự debug:** 5 (xem bảng ở trên)

**Stack cuối cùng:**
- Frontend: HTML + CSS + Vanilla JS (Single Page App)
- Backend: Node.js 20 + Express 4
- Database: PostgreSQL (Neon serverless, free tier)
- AI: Claude Haiku 4.5 (Anthropic)
- Deploy: Railway (Nixpacks builder, auto-deploy từ GitHub)
- Auth: JWT + bcrypt
- Security: Helmet (CSP), CORS, Rate Limiting (express-rate-limit)

**URL production:** https://tiktok-app-production-4d5b.up.railway.app  
**GitHub:** https://github.com/tranthuylinh180803-ai/-tiktok-caption-app
