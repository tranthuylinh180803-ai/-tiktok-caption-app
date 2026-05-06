const express = require('express');
const { body, validationResult } = require('express-validator');
const { history } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const TIKTOK_REGEX = /^https?:\/\/(www\.|vm\.)?tiktok\.com\/.+/;

async function fetchTikTokMeta(url) {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const d = await res.json();
      return { title: d.title || '', author: d.author_name || '' };
    }
  } catch { /* ignore */ }
  return null;
}

async function generateWithClaude(meta, url) {
  if (!process.env.ANTHROPIC_API_KEY) return generateTemplate(meta);
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const context = meta
      ? `Tiêu đề: "${meta.title}", Tác giả: @${meta.author}`
      : `URL: ${url}`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Dựa trên video TikTok: ${context}

Tạo nội dung marketing:
1. CAPTION: hấp dẫn, 100-150 ký tự, tiếng Việt
2. CTA: call-to-action ngắn, 20-40 ký tự, tiếng Việt
3. TAGS: 6-8 hashtag phù hợp (không có #, phân cách bằng dấu phẩy)

JSON: {"caption":"...","cta":"...","tags":["tag1","tag2",...]}`
      }]
    });

    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through */ }
  return generateTemplate(meta);
}

function generateTemplate(meta) {
  const title = meta?.title || '';
  const author = meta?.author || '';
  const captions = [
    `${title ? `"${title.slice(0, 60)}"` : 'Video này'} — Nội dung không thể bỏ qua! 🔥`,
    `${author ? `@${author}` : 'Creator này'} vừa share tip cực hay! ✨ Bạn đã xem chưa?`,
    `Trending hôm nay: ${title ? title.slice(0, 70) : 'video viral mới nhất'} 🎯`
  ];
  const ctas = [
    'Theo dõi để không bỏ lỡ! 👇',
    'Lưu lại để dùng sau nhé! 💾',
    'Tag bạn bè cùng xem nào! 🏷️'
  ];
  return {
    caption: captions[Math.floor(Math.random() * captions.length)],
    cta: ctas[Math.floor(Math.random() * ctas.length)],
    tags: ['trending', 'viral', 'tiktok', 'xuhuong', 'contentmarketing', 'video']
  };
}

// POST /generate — public, lưu user_id nếu đã đăng nhập
router.post('/generate', [
  body('url').trim().matches(TIKTOK_REGEX).withMessage('Link TikTok không hợp lệ. Ví dụ: https://www.tiktok.com/@user/video/...')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { url } = req.body;
  try {
    const meta = await fetchTikTokMeta(url);
    const result = await generateWithClaude(meta, url);

    // Lấy user_id từ token nếu có (optional auth)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch { /* token không hợp lệ hoặc hết hạn — bỏ qua */ }
    }

    await history.add({ user_id: userId, video_url: url, caption: result.caption, cta: result.cta, tags: result.tags });
    res.json({ success: true, data: result, videoInfo: meta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể tạo caption, vui lòng thử lại.' });
  }
});

// GET /history — yêu cầu đăng nhập, chỉ trả về history của user đó
router.get('/history', authenticate, async (req, res) => {
  try {
    res.json(await history.recent(req.user.userId, 10));
  } catch {
    res.status(500).json({ error: 'Không thể tải lịch sử' });
  }
});

module.exports = router;
