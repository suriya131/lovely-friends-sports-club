const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'club.db');

// Initialize SQLite Database
const db = new DatabaseSync(DB_PATH);

// Create Tables
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
if (countChallenges.count === 0) {
  const insertChallenge = db.prepare('INSERT INTO challenges (name, sport, contact, message) VALUES (?, ?, ?, ?)');
  insertChallenge.run('YTFFUY', 'Kabaddi', 'dydu999999996', '55555521');
}
const countPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get();
if (countPlayers.count === 0) {
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
if (countMatches.count === 0) {
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
if (countLive.count === 0) {
  db.prepare(`
    INSERT INTO live_match (id, your_team, opp_team, your_score, opp_score, timer_seconds, is_running, yt_link)
    VALUES (1, 'LOVELY FRIENDS', 'OPPONENT TEAM', 0, 0, 1200, 0, '')
  `).run();
}

const countPhotos = db.prepare('SELECT COUNT(*) as count FROM photos').get();
if (countPhotos.count === 0) {
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

// Connected SSE clients for live updates
const sseClients = new Set();

function broadcastLiveUpdate(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
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

// HTTP Server
const server = http.createServer(async (req, res) => {
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

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
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
      const sport = body.sport || 'Kabaddi';
      const stmt = db.prepare('INSERT INTO matches (sport, opp, venue, score, status) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(sport, body.opp, body.venue, body.score, body.status);
      return sendJson(res, 201, { id: result.lastInsertRowid, sport, ...body });
    }
  }

  if (pathname.startsWith('/api/matches/') && req.method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/matches/', ''), 10);
    if (!id) return sendJson(res, 400, { error: 'Invalid ID' });
    db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // Challenges / Request Box API
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

  // 3. Live Match Score API & SSE Stream
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    sseClients.add(res);

    // Send current state immediately on connect
    const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get();
    res.write(`data: ${JSON.stringify(current)}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 4. Photos (Gallery) API
  if (pathname === '/api/photos') {
    if (req.method === 'GET') {
      const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();
      return sendJson(res, 200, photos);
    }
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.caption || !body.uploader || !body.data) {
        return sendJson(res, 400, { error: 'caption, uploader, and data are required' });
      }
      const id = body.id || `img_${Date.now()}`;
      db.prepare('INSERT INTO photos (id, caption, uploader, data) VALUES (?, ?, ?, ?)').run(
        id, body.caption, body.uploader, body.data
      );
      return sendJson(res, 201, { id, caption: body.caption, uploader: body.uploader, data: body.data });
    }
  }

  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = pathname.replace('/api/photos/', '');
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    return sendJson(res, 200, { success: true, id });
  }

  // 5. Sign In Notification & Audit Log API
  if (pathname === '/api/login-notify' && req.method === 'POST') {
    const body = await parseBody(req);
    const identifier = body.identifier || 'Unknown User';
    const targetPhone = body.target_phone || '7397101974';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // Save to Database audit log
    const stmt = db.prepare('INSERT INTO login_logs (identifier, target_phone, ip) VALUES (?, ?, ?)');
    const result = stmt.run(identifier, targetPhone, ip);

    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`[SIGN-IN ALERT] User "${identifier}" signed in at ${time}. Alert target: ${targetPhone} (IP: ${ip})`);

    // Prepare message payload
    const alertMessage = `⚠️ Lovely Friends Club Alert: User "${identifier}" just signed in to the admin panel at ${time}.`;

    return sendJson(res, 200, {
      success: true,
      id: result.lastInsertRowid,
      target_phone: targetPhone,
      message: alertMessage,
      whatsapp_link: `https://wa.me/91${targetPhone}?text=${encodeURIComponent(alertMessage)}`
    });
  }

  // Route to view sign-in history log
  if (pathname === '/api/login-logs' && req.method === 'GET') {
    const logs = db.prepare('SELECT * FROM login_logs ORDER BY id DESC LIMIT 50').all();
    return sendJson(res, 200, logs);
  }

    // 6. Dynamic User Authentication & Role Assignment
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const identifier = (body.identifier || '').trim();
    const password = (body.password || '').trim();
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

    // Admin role is ONLY granted when the admin code is entered in the dedicated Admin Password box
    const wantsAdmin = (adminCode === 'NSPLFC');
    const role = wantsAdmin ? 'Club Admin' : 'Member';

    // Log sign-in event
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
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security check: stay within workspace
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`  LOVELY FRIENDS CLUB - BACKEND & DATABASE RUNNING`);
  console.log(`  Local Website: http://localhost:${PORT}`);
  console.log(`  Database File: ${DB_PATH}`);
  console.log(`=================================================`);
});
