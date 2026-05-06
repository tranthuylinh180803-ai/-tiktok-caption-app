const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { users } = require('../db/database');

const router = express.Router();

const validate = [
  body('username').trim().isLength({ min: 3, max: 30 }).escape(),
  body('password').isLength({ min: 6 })
];

router.post('/register', validate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;
  try {
    if (await users.findByUsername(username)) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await users.create({ username, password: hashed });
    const token = jwt.sign({ userId: user.id, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, username });
  } catch {
    res.status(500).json({ error: 'Đăng ký thất bại' });
  }
});

router.post('/login', [
  body('username').trim().escape(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;
  try {
    const user = await users.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch {
    res.status(500).json({ error: 'Đăng nhập thất bại' });
  }
});

module.exports = router;
