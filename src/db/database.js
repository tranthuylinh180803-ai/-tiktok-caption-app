const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id       SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      published  BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS history (
      id        SERIAL PRIMARY KEY,
      user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      video_url TEXT NOT NULL,
      caption   TEXT,
      cta       TEXT,
      tags      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database initialized');
}

/* ── users ──────────────────────────────────────────── */
const users = {
  findByUsername: u =>
    query('SELECT * FROM users WHERE username = $1', [u]).then(r => r[0] || null),
  findById: id =>
    query('SELECT * FROM users WHERE id = $1', [id]).then(r => r[0] || null),
  create: async ({ username, password }) => {
    const r = await query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [username, password]
    );
    return r[0];
  }
};

/* ── posts ──────────────────────────────────────────── */
const posts = {
  all: () => query(`
    SELECT p.*, u.username AS author
    FROM posts p LEFT JOIN users u ON p.author_id = u.id
    WHERE p.published = TRUE ORDER BY p.created_at DESC
  `),
  bySlug: slug => query(`
    SELECT p.*, u.username AS author
    FROM posts p LEFT JOIN users u ON p.author_id = u.id
    WHERE p.slug = $1 AND p.published = TRUE
  `, [slug]).then(r => r[0] || null),
  byId: id =>
    query('SELECT * FROM posts WHERE id = $1', [id]).then(r => r[0] || null),
  create: async ({ title, content, slug, author_id }) => {
    const r = await query(
      'INSERT INTO posts (title, content, slug, author_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, content, slug, author_id]
    );
    return r[0];
  },
  update: (id, { title, content }) =>
    query(
      'UPDATE posts SET title = $1, content = $2, updated_at = NOW() WHERE id = $3',
      [title, content, id]
    ),
  remove: id => query('DELETE FROM posts WHERE id = $1', [id])
};

/* ── history ────────────────────────────────────────── */
const history = {
  add: ({ user_id = null, video_url, caption, cta, tags }) =>
    query(
      'INSERT INTO history (user_id, video_url, caption, cta, tags) VALUES ($1, $2, $3, $4, $5)',
      [user_id, video_url, caption, cta, JSON.stringify(tags)]
    ),
  recent: async (userId, limit = 10) => {
    const rows = await query(
      'SELECT * FROM history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
  }
};

module.exports = { initDB, users, posts, history };
