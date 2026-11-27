const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = process.env.PORT || 3000;
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

// ==================== DATABASE INITIALIZATION ====================
// Resilient SQLite loader with Vercel serverless /tmp support & in-memory fallback

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  // node:sqlite is available in Node 22.5+. If unavailable, we use the in-memory fallback store.
}

let db = null;
let DB_PATH = path.join(__dirname, 'club.db');

// In-memory default store for fallbacks
const defaultStore = {
  players: [
    { id: 1, name: 'AK Samy', position: 'Manager', jersey: 'TM' },
    { id: 2, name: 'Vimal Raj (C)', position: 'All-Rounder', jersey: '01' },
    { id: 3, name: 'Vijay (VC)', position: 'Right Corner', jersey: '82' },
    { id: 4, name: 'Jeyam Gowsi', position: 'Right Cover', jersey: '03' },
    { id: 5, name: 'Praveen', position: 'Left Cover', jersey: '09' }
  ],
  matches: [
    { id: 1, sport: 'Kabaddi', opp: 'Namasivayapuram Strikers', venue: 'Kovilpatti', score: 'LFC won by 20 points', status: 'won' },
    { id: 2, sport: 'Kabaddi', opp: 'District Spartans', venue: 'NSP', score: 'LFC won by 15 points', status: 'won' },
    { id: 3, sport: 'Kabaddi', opp: 'Royal Eagles FC', venue: 'Vilathikulam', score: 'Lost by 5 points', status: 'lost' },
    { id: 4, sport: 'Kabaddi', opp: 'Warriors XI', venue: 'Sivananapuram', score: 'LFC won by 8 points', status: 'won' },
    { id: 5, sport: 'Kabaddi', opp: 'Smashers Club', venue: 'Sakkamalpuram', score: 'Lost by 2 points', status: 'lost' }
  ],
  challenges: [
    { id: 1, name: 'YTFFUY', sport: 'Kabaddi', contact: 'dydu999999996', message: '55555521' }
  ],
  live_match: {
    id: 1,
    your_team: 'LOVELY FRIENDS',
    opp_team: 'OPPONENT TEAM',
    your_score: 0,
    opp_score: 0,
    timer_seconds: 1200,
    is_running: 0,
    yt_link: ''
  },
  photos: [
    {
      id: 'default-1',
      caption: 'Victory Celebration 2025',
      uploader: 'Club Admin',
      data: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      created_at: new Date().toISOString()
    },
    {
      id: 'default-2',
      caption: 'Volleyball Final Match',
      uploader: 'Ramesh',
      data: 'https://images.unsplash.com/photo-1593341646782-e0b495cff86d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      created_at: new Date().toISOString()
    }
  ],
  login_logs: []
};

function createInMemoryMockDb(store) {
  return {
    exec(sql) {},
    prepare(sql) {
      const s = sql.trim().toUpperCase();
      return {
        all(...params) {
          if (s.includes('FROM PLAYERS')) return [...store.players];
          if (s.includes('FROM MATCHES')) return [...store.matches];
          if (s.includes('FROM CHALLENGES')) return [...store.challenges];
          if (s.includes('FROM PHOTOS')) return [...store.photos];
          if (s.includes('FROM LOGIN_LOGS')) return [...store.login_logs];
          return [];
        },
        get(...params) {
          if (s.includes('COUNT(*) AS COUNT FROM CHALLENGES')) return { count: store.challenges.length };
          if (s.includes('COUNT(*) AS COUNT FROM PLAYERS')) return { count: store.players.length };
          if (s.includes('COUNT(*) AS COUNT FROM MATCHES')) return { count: store.matches.length };
          if (s.includes('COUNT(*) AS COUNT FROM LIVE_MATCH')) return { count: 1 };
          if (s.includes('COUNT(*) AS COUNT FROM PHOTOS')) return { count: store.photos.length };
          if (s.includes('FROM LIVE_MATCH')) return { ...store.live_match };
          return null;
        },
        run(...params) {
          if (s.startsWith('INSERT INTO PLAYERS')) {
            const id = (store.players.length ? Math.max(...store.players.map(p => p.id)) : 0) + 1;
            const newPlayer = { id, name: params[0], position: params[1], jersey: params[2] };
            store.players.push(newPlayer);
            return { lastInsertRowid: id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO MATCHES')) {
            const id = (store.matches.length ? Math.max(...store.matches.map(m => m.id)) : 0) + 1;
            store.matches.unshift({ id, sport: params[0], opp: params[1], venue: params[2], score: params[3], status: params[4] });
            return { lastInsertRowid: id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO CHALLENGES')) {
            const id = (store.challenges.length ? Math.max(...store.challenges.map(c => c.id)) : 0) + 1;
            store.challenges.unshift({ id, name: params[0], sport: params[1], contact: params[2], message: params[3] });
            return { lastInsertRowid: id, changes: 1 };
          }
          if (s.startsWith('INSERT INTO PHOTOS')) {
            store.photos.unshift({ id: params[0], caption: params[1], uploader: params[2], data: params[3], created_at: new Date().toISOString() });
            return { lastInsertRowid: 1, changes: 1 };
          }
          if (s.startsWith('DELETE FROM PLAYERS')) {
            store.players = store.players.filter(p => p.id !== params[0]);
            return { changes: 1 };
          }
          if (s.startsWith('DELETE FROM MATCHES')) {
            store.matches = store.matches.filter(m => m.id !== params[0]);
            return { changes: 1 };
          }
          if (s.startsWith('DELETE FROM CHALLENGES')) {
            store.challenges = store.challenges.filter(c => c.id !== params[0]);
            return { changes: 1 };
          }
          if (s.startsWith('DELETE FROM PHOTOS')) {
            store.photos = store.photos.filter(p => p.id !== params[0]);
            return { changes: 1 };
          }
          if (s.includes('UPDATE LIVE_MATCH')) {
            store.live_match = {
              ...store.live_match,
              your_score: params[0] !== undefined ? params[0] : store.live_match.your_score,
              opp_score: params[1] !== undefined ? params[1] : store.live_match.opp_score,
              timer_seconds: params[2] !== undefined ? params[2] : store.live_match.timer_seconds,
              is_running: params[3] !== undefined ? params[3] : store.live_match.is_running,
              yt_link: params[4] !== undefined ? params[4] : store.live_match.yt_link
            };
            return { changes: 1 };
          }
          if (s.startsWith('INSERT INTO LOGIN_LOGS')) {
            store.login_logs.push({ id: store.login_logs.length + 1, identifier: params[0], target_phone: params[1], ip: params[2] });
            return { lastInsertRowid: store.login_logs.length, changes: 1 };
          }
          return { lastInsertRowid: 1, changes: 1 };
        }
      };
    }
  };
}

if (DatabaseSync) {
  try {
    if (isServerless) {
      // Vercel serverless environment has a read-only root; use /tmp which is writable
      const tmpDbPath = path.join(os.tmpdir(), 'club.db');
      if (fs.existsSync(DB_PATH) && !fs.existsSync(tmpDbPath)) {
        try { fs.copyFileSync(DB_PATH, tmpDbPath); } catch (_) {}
      }
      DB_PATH = tmpDbPath;
    }
    db = new DatabaseSync(DB_PATH);
  } catch (err) {
    console.warn('SQLite file init failed, attempting in-memory SQLite:', err.message);
    try {
      db = new DatabaseSync(':memory:');
    } catch (_) {
      db = null;
    }
  }
}

if (!db) {
  console.log('Using in-memory database store (safe for all serverless runtimes)');
  db = createInMemoryMockDb(defaultStore);
}

// Create Tables & Seed Data safely
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      jersey TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sport TEXT DEFAULT 'Kabaddi',
      opp TEXT NOT NULL,
      venue TEXT NOT NULL,
      score TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS live_match (
      id INTEGER PRIMARY KEY,
      your_team TEXT DEFAULT 'LOVELY FRIENDS',
      opp_team TEXT DEFAULT 'OPPONENT TEAM',
      your_score INTEGER DEFAULT 0,
      opp_score INTEGER DEFAULT 0,
      timer_seconds INTEGER DEFAULT 1200,
      is_running INTEGER DEFAULT 0,
      yt_link TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      caption TEXT NOT NULL,
      uploader TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      target_phone TEXT DEFAULT '7397101974',
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sport TEXT NOT NULL,
      contact TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Pre-seed tables if empty
  const countChallenges = db.prepare('SELECT COUNT(*) as count FROM challenges').get();
  if (countChallenges && countChallenges.count === 0) {
    const insertChallenge = db.prepare('INSERT INTO challenges (name, sport, contact, message) VALUES (?, ?, ?, ?)');
    insertChallenge.run('YTFFUY', 'Kabaddi', 'dydu999999996', '55555521');
  }

  const countPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get();
  if (countPlayers && countPlayers.count === 0) {
    const insertPlayer = db.prepare('INSERT INTO players (name, position, jersey) VALUES (?, ?, ?)');
    const defaultPlayers = [
      ['AK Samy', 'Manager', 'TM'],
      ['Vimal Raj (C)', 'All-Rounder', '01'],
      ['Vijay (VC)', 'Right Corner', '82'],
      ['Jeyam Gowsi', 'Right Cover', '03'],
      ['Praveen', 'Left Cover', '09']
    ];
    for (const p of defaultPlayers) {
      insertPlayer.run(p[0], p[1], p[2]);
    }
  }

  const countMatches = db.prepare('SELECT COUNT(*) as count FROM matches').get();
  if (countMatches && countMatches.count === 0) {
    const insertMatch = db.prepare('INSERT INTO matches (sport, opp, venue, score, status) VALUES (?, ?, ?, ?, ?)');
    const defaultMatches = [
      ['Kabaddi', 'Namasivayapuram Strikers', 'Kovilpatti', 'LFC won by 20 points', 'won'],
      ['Kabaddi', 'District Spartans', 'NSP', 'LFC won by 15 points', 'won'],
      ['Kabaddi', 'Royal Eagles FC', 'Vilathikulam', 'Lost by 5 points', 'lost'],
      ['Kabaddi', 'Warriors XI', 'Sivananapuram', 'LFC won by 8 points', 'won'],
      ['Kabaddi', 'Smashers Club', 'Sakkamalpuram', 'Lost by 2 points', 'lost']
    ];
    for (const m of defaultMatches) {
      insertMatch.run(m[0], m[1], m[2], m[3], m[4]);
    }
  }

  const countLive = db.prepare('SELECT COUNT(*) as count FROM live_match WHERE id = 1').get();
  if (countLive && countLive.count === 0) {
    db.prepare(`
      INSERT INTO live_match (id, your_team, opp_team, your_score, opp_score, timer_seconds, is_running, yt_link)
      VALUES (1, 'LOVELY FRIENDS', 'OPPONENT TEAM', 0, 0, 1200, 0, '')
    `).run();
  }

  const countPhotos = db.prepare('SELECT COUNT(*) as count FROM photos').get();
  if (countPhotos && countPhotos.count === 0) {
    const insertPhoto = db.prepare('INSERT INTO photos (id, caption, uploader, data) VALUES (?, ?, ?, ?)');
    insertPhoto.run(
      'default-1',
      'Victory Celebration 2025',
      'Club Admin',
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    );
    insertPhoto.run(
      'default-2',
      'Volleyball Final Match',
      'Ramesh',
      'https://images.unsplash.com/photo-1593341646782-e0b495cff86d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    );
  }
} catch (err) {
  console.warn('Database table setup notice:', err.message);
}

// Connected SSE clients for live updates
const sseClients = new Set();

function broadcastLiveUpdate(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (_) {}
  }
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4'
};

// Helper: Parse JSON Body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) { // 20MB limit for image uploads
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Helper: JSON Response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Request Handler
async function requestHandler(req, res) {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // ==================== REST API ROUTES ====================

  // 1. Players API
  if (pathname === '/api/players') {
    if (req.method === 'GET') {
      const players = db.prepare('SELECT * FROM players ORDER BY id ASC').all();
      return sendJson(res, 200, players);
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name || !body.position || !body.jersey) {
        return sendJson(res, 400, { error: 'name, position, and jersey are required' });
      }
      const stmt = db.prepare('INSERT INTO players (name, position, jersey) VALUES (?, ?, ?)');
      const result = stmt.run(body.name, body.position, body.jersey);
      return sendJson(res, 201, { id: result.lastInsertRowid, ...body });
    }
  }

  if (pathname.startsWith('/api/players/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/players/', ''), 10);
    if (!id) return sendJson(res, 400, { error: 'Invalid ID' });
    db.prepare('DELETE FROM players WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // 2. Matches API
  if (pathname === '/api/matches') {
    if (req.method === 'GET') {
      const matches = db.prepare('SELECT * FROM matches ORDER BY id DESC').all();
      return sendJson(res, 200, matches);
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.opp || !body.venue || !body.score || !body.status) {
        return sendJson(res, 400, { error: 'opp, venue, score, and status are required' });
      }
      const stmt = db.prepare('INSERT INTO matches (sport, opp, venue, score, status) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(body.sport || 'Kabaddi', body.opp, body.venue, body.score, body.status);
      return sendJson(res, 201, { id: result.lastInsertRowid, ...body });
    }
  }

  if (pathname.startsWith('/api/matches/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/matches/', ''), 10);
    if (!id) return sendJson(res, 400, { error: 'Invalid ID' });
    db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // 3. Challenges API
  if (pathname === '/api/challenges') {
    if (req.method === 'GET') {
      const challenges = db.prepare('SELECT * FROM challenges ORDER BY id DESC').all();
      return sendJson(res, 200, challenges);
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name || !body.sport || !body.contact || !body.message) {
        return sendJson(res, 400, { error: 'name, sport, contact, and message are required' });
      }
      const stmt = db.prepare('INSERT INTO challenges (name, sport, contact, message) VALUES (?, ?, ?, ?)');
      const result = stmt.run(body.name, body.sport, body.contact, body.message);
      return sendJson(res, 201, { id: result.lastInsertRowid, ...body });
    }
  }

  if (pathname.startsWith('/api/challenges/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/challenges/', ''), 10);
    if (!id) return sendJson(res, 400, { error: 'Invalid ID' });
    db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // 4. Live Match Score API & SSE Stream
  if (pathname === '/api/live') {
    if (req.method === 'GET') {
      const live = db.prepare('SELECT * FROM live_match WHERE id = 1').get();
      return sendJson(res, 200, live || {});
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() || {};

      const your_score = body.your_score !== undefined ? body.your_score : current.your_score;
      const opp_score = body.opp_score !== undefined ? body.opp_score : current.opp_score;
      const timer_seconds = body.timer_seconds !== undefined ? body.timer_seconds : current.timer_seconds;
      const is_running = body.is_running !== undefined ? (body.is_running ? 1 : 0) : current.is_running;
      const yt_link = body.yt_link !== undefined ? body.yt_link : current.yt_link;

      db.prepare(`
        UPDATE live_match 
        SET your_score = ?, opp_score = ?, timer_seconds = ?, is_running = ?, yt_link = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(your_score, opp_score, timer_seconds, is_running, yt_link);

      const updated = db.prepare('SELECT * FROM live_match WHERE id = 1').get();
      broadcastLiveUpdate(updated);
      return sendJson(res, 200, updated);
    }
  }

  // SSE Stream for live score sync across multiple devices
  if (pathname === '/api/live/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    sseClients.add(res);

    const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get();
    if (current) {
      res.write(`data: ${JSON.stringify(current)}\n\n`);
    }

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 5. Photos (Gallery) API
  if (pathname === '/api/photos') {
    if (req.method === 'GET') {
      const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();
      return sendJson(res, 200, photos);
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.caption || !body.data) {
        return sendJson(res, 400, { error: 'caption and data are required' });
      }
      const id = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const uploader = body.uploader || 'Club Admin';
      db.prepare('INSERT INTO photos (id, caption, uploader, data) VALUES (?, ?, ?, ?)').run(
        id, body.caption, uploader, body.data
      );
      return sendJson(res, 201, { id, caption: body.caption, uploader, data: body.data });
    }
  }

  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = pathname.replace('/api/photos/', '');
    if (!id) return sendJson(res, 400, { error: 'Invalid ID' });
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // 6. Login Logs API
  if (pathname === '/api/login-logs') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const identifier = body.identifier || 'unknown';
      const target_phone = body.target_phone || '7397101974';
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

      const stmt = db.prepare('INSERT INTO login_logs (identifier, target_phone, ip) VALUES (?, ?, ?)');
      const result = stmt.run(identifier, target_phone, ip);
      return sendJson(res, 201, {
        success: true,
        id: result.lastInsertRowid,
        identifier,
        target_phone,
        ip
      });
    }

    if (req.method === 'GET') {
      const logs = db.prepare('SELECT * FROM login_logs ORDER BY id DESC LIMIT 50').all();
      return sendJson(res, 200, logs);
    }
  }

  // 7. Signin Endpoint
  if (pathname === '/api/auth/signin' && req.method === 'POST') {
    const body = await parseBody(req);
    const identifier = (body.identifier || '').trim();
    const adminCode = (body.admin_code || '').trim();

    if (!identifier) {
      return sendJson(res, 400, { success: false, message: 'Please enter your phone number or email.' });
    }

    if (adminCode && adminCode !== 'NSPLFC') {
      return sendJson(res, 401, {
        success: false,
        message: 'Incorrect Admin Password!'
      });
    }

    const wantsAdmin = (adminCode === 'NSPLFC');
    const role = wantsAdmin ? 'Club Admin' : 'Member';

    try {
      db.prepare('INSERT INTO login_logs (identifier, target_phone, ip) VALUES (?, ?, ?)').run(
        identifier, '7397101974', req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'
      );
    } catch (e) {}

    return sendJson(res, 200, {
      success: true,
      user: {
        identifier,
        isAdmin: wantsAdmin,
        role
      },
      message: wantsAdmin ? 'Signed in as Club Admin!' : `Welcome, ${identifier}!`
    });
  }

  // ==================== STATIC FILE SERVING ====================
  let rawPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(__dirname, rawPath);

  // Security check: stay within workspace
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(__dirname);
  if (!resolvedPath.startsWith(resolvedBase)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Clean URLs support: if file not found and .html exists, serve the .html file
  if (!fs.existsSync(resolvedPath) && fs.existsSync(resolvedPath + '.html')) {
    filePath = resolvedPath + '.html';
  } else {
    filePath = resolvedPath;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style=\"background:#0f172a;color:#f8fafc;font-family:sans-serif;text-align:center;padding:50px;\"><h1>404 - Page Not Found</h1><p><a href=\"/\" style=\"color:#38bdf8;\">Return to Home</a></p></body></html>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Create HTTP Server
const server = http.createServer(requestHandler);

// Only listen when running standalone locally or in a container (NOT in Vercel serverless)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  LOVELY FRIENDS CLUB - BACKEND & DATABASE RUNNING`);
    console.log(`  Local Website: http://localhost:${PORT}`);
    console.log(`  Database File: ${DB_PATH}`);
    console.log(`=================================================`);
  });
}

// Universal Hybrid Export:
// Compatible with both Vercel Serverless Function (req, res handler) AND http.Server listeners
function handler(req, res) {
  return server.emit('request', req, res);
}
handler.server = server;
handler.listen = (...args) => server.listen(...args);
handler.default = handler;

module.exports = handler;
