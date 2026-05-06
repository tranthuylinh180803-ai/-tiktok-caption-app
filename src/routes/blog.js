const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { posts } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-');
}

router.get('/', async (req, res) => {
  try { res.json(await posts.all()); }
  catch { res.status(500).json({ error: 'Không thể tải bài viết' }); }
});

router.get('/:slug', [param('slug').trim().escape()], async (req, res) => {
  try {
    const p = await posts.bySlug(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    res.json(p);
  } catch { res.status(500).json({ error: 'Không thể tải bài viết' }); }
});

router.post('/', authenticate, [
  body('title').trim().isLength({ min: 3, max: 200 }).escape(),
  body('content').trim().isLength({ min: 10 }).withMessage('Nội dung phải có ít nhất 10 ký tự')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, content } = req.body;
  const slug = slugify(title) + '-' + Date.now();
  try {
    const p = await posts.create({ title, content, slug, author_id: req.user.userId });
    res.status(201).json({ id: p.id, slug });
  } catch { res.status(500).json({ error: 'Không thể tạo bài viết' }); }
});

router.put('/:id', authenticate, [
  param('id').isInt(),
  body('title').trim().isLength({ min: 3, max: 200 }).escape(),
  body('content').trim().isLength({ min: 10 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id);
  const { title, content } = req.body;
  try {
    const p = await posts.byId(id);
    if (!p) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    if (p.author_id !== req.user.userId) return res.status(403).json({ error: 'Không có quyền chỉnh sửa' });
    await posts.update(id, { title, content });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Không thể cập nhật bài viết' }); }
});

router.delete('/:id', authenticate, [param('id').isInt()], async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const p = await posts.byId(id);
    if (!p) return res.status(404).json({ error: 'Không tìm thấy bài viết' });
    if (p.author_id !== req.user.userId) return res.status(403).json({ error: 'Không có quyền xóa' });
    await posts.remove(id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Không thể xóa bài viết' }); }
});

module.exports = router;
