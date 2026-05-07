require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`,
  credentials: true
}));

// Global rate limit: 100 req / 15 min
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Stricter limit for AI generation: 10 req / min
const captionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/auth', require('./routes/auth'));
app.use('/api/caption', captionLimiter, require('./routes/caption'));
app.use('/api/blog', require('./routes/blog'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, _next) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), ctx: 'global',
    msg: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  }));
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  initDB()
    .then(() => console.log('Database ready'))
    .catch(err => {
      console.error('DB FATAL:', err.message, 'code:', err.code);
      process.exit(1);
    });
});
