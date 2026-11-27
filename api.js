/**
 * Lovely Friends Club - Unified API & Database Client
 * Works with:
 * 1. Supabase Cloud Database (Primary when SUPABASE_CONFIG is set)
 * 2. Native Local Backend Server (SQLite at /api/...)
 * 3. Graceful offline fallback (localStorage if opened via file://)
 */

const SUPABASE_CONFIG = {
  url: 'https://kfxppbeovvthgrrkijhk.supabase.co',
  anonKey: 'sb_secret_CKZOoIysaY3Wp51Ve3YKpQ_N0AheZhS'
};

const API = {
  isLocalServer: window.location.protocol.startsWith('http'),
  hasSupabase: Boolean(SUPABASE_CONFIG.url && !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_ID') && SUPABASE_CONFIG.anonKey),

  async supabaseRequest(path, options = {}) {
    if (!this.hasSupabase) return null;
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${path}`;
    const headers = {
      'apikey': SUPABASE_CONFIG.anonKey,
      'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {})
    };
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Supabase request error:', e);
    }
    return null;
  },

  // ================= PLAYERS =================
  async getPlayers() {
    // 1. Try Supabase Cloud
    if (this.hasSupabase) {
      const data = await this.supabaseRequest('players?select=*&order=id.asc');
      if (Array.isArray(data) && data.length > 0) {
        return data.map(p => ({
          id: p.id,
          name: p.Name || p.name,
          position: p.Position || p.position,
          jersey: (p['jersey no'] !== undefined) ? String(p['jersey no']) : (p.jersey || '00')
        }));
      }
    }

    // 2. Try Local Server
    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/players');
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    // 3. Fallback
    const stored = localStorage.getItem('lfc_players');
    return stored ? JSON.parse(stored) : [
      { id: 1, name: "AK Samy", position: "Manager", jersey: "TM" },
      { id: 2, name: "Vimal Raj (C)", position: "All-Rounder", jersey: "01" },
      { id: 3, name: "Vijay (VC)", position: "Right Corner", jersey: "82" },
      { id: 4, name: "Jeyam Gowsi", position: "Right Cover", jersey: "03" },
      { id: 5, name: "Praveen", position: "Left Cover", jersey: "09" }
    ];
  },

  async addPlayer(player) {
    if (this.hasSupabase) {
      const payload = {
        "Name": player.name,
        "Position": player.position,
        "jersey no": player.jersey,
        "created_at": new Date().toISOString()
      };
      const res = await this.supabaseRequest('players', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res[0]) return res[0];
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(player)
        });
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    const players = await this.getPlayers();
    const newPlayer = { id: Date.now(), ...player };
    players.push(newPlayer);
    localStorage.setItem('lfc_players', JSON.stringify(players));
    return newPlayer;
  },

  async deletePlayer(id) {
    if (this.hasSupabase) {
      await this.supabaseRequest(`players?id=eq.${id}`, { method: 'DELETE' });
    }

    if (this.isLocalServer && typeof id === 'number') {
      try {
        const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
        if (res.ok) return true;
      } catch (err) {}
    }

    const players = await this.getPlayers();
    const filtered = players.filter(p => p.id !== id);
    localStorage.setItem('lfc_players', JSON.stringify(filtered));
    return true;
  },

  // ================= MATCH STATS =================
  async getMatches() {
    if (this.hasSupabase) {
      const data = await this.supabaseRequest('matches?select=*&order=id.desc');
      if (Array.isArray(data) && data.length > 0) return data;
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/matches');
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    const stored = localStorage.getItem('lfc_matches');
    return stored ? JSON.parse(stored) : [
      { id: 1, sport: 'Kabaddi', opp: 'Namasivayapuram Strikers', venue: 'Kovilpatti', score: 'LFC won by 20 points', status: 'won' },
      { id: 2, sport: 'Kabaddi', opp: 'District Spartans', venue: 'NSP', score: 'LFC won by 15 points', status: 'won' },
      { id: 3, sport: 'Kabaddi', opp: 'Royal Eagles FC', venue: 'Vilathikulam', score: 'Lost by 5 points', status: 'lost' },
      { id: 4, sport: 'Kabaddi', opp: 'Warriors XI', venue: 'Sivananapuram', score: 'LFC won by 8 points', status: 'won' },
      { id: 5, sport: 'Kabaddi', opp: 'Smashers Club', venue: 'Sakkamalpuram', score: 'Lost by 2 points', status: 'lost' }
    ];
  },

  async addMatch(match) {
    if (this.hasSupabase) {
      const res = await this.supabaseRequest('matches', {
        method: 'POST',
        body: JSON.stringify(match)
      });
      if (res && res[0]) return res[0];
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(match)
        });
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    const matches = await this.getMatches();
    const newMatch = { id: Date.now(), ...match };
    matches.unshift(newMatch);
    localStorage.setItem('lfc_matches', JSON.stringify(matches));
    return newMatch;
  },

  async deleteMatch(id) {
    if (this.hasSupabase) {
      await this.supabaseRequest(`matches?id=eq.${id}`, { method: 'DELETE' });
    }

    if (this.isLocalServer && typeof id === 'number') {
      try {
        const res = await fetch(`/api/matches/${id}`, { method: 'DELETE' });
        if (res.ok) return true;
      } catch (err) {}
    }

    const matches = await this.getMatches();
    const filtered = matches.filter(m => m.id !== id);
    localStorage.setItem('lfc_matches', JSON.stringify(filtered));
    return true;
  },

  // ================= LIVE MATCH =================
  async getLiveMatch() {
    if (this.hasSupabase) {
      const data = await this.supabaseRequest('live_match?select=*&id=eq.1');
      if (Array.isArray(data) && data[0]) return data[0];
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/live');
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    return {
      your_team: 'LOVELY FRIENDS',
      opp_team: 'OPPONENT TEAM',
      your_score: parseInt(localStorage.getItem('lfc_your_score') || '0', 10),
      opp_score: parseInt(localStorage.getItem('lfc_opp_score') || '0', 10),
      timer_seconds: 1200,
      is_running: 0,
      yt_link: localStorage.getItem('lfc_yt_link') || ''
    };
  },

  async updateLiveMatch(updates) {
    if (this.hasSupabase) {
      await this.supabaseRequest('live_match?id=eq.1', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    if (updates.your_score !== undefined) localStorage.setItem('lfc_your_score', updates.your_score);
    if (updates.opp_score !== undefined) localStorage.setItem('lfc_opp_score', updates.opp_score);
    if (updates.yt_link !== undefined) localStorage.setItem('lfc_yt_link', updates.yt_link);
    return updates;
  },

  listenLiveUpdates(callback) {
    if (this.isLocalServer && window.EventSource) {
      const eventSource = new EventSource('/api/live/stream');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          callback(data);
        } catch (e) {
          console.error('Error parsing SSE data', e);
        }
      };
      return eventSource;
    }
    return null;
  },

  // ================= PHOTOS / GALLERY =================
  async getPhotos() {
    if (this.hasSupabase) {
      const data = await this.supabaseRequest('photos?select=*&order=created_at.desc');
      if (Array.isArray(data) && data.length > 0) return data;
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/photos');
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    const stored = localStorage.getItem('lfc_photos');
    return stored ? JSON.parse(stored) : [
      {
        id: 'default-1',
        data: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        caption: 'Victory Celebration 2025',
        uploader: 'Club Admin'
      },
      {
        id: 'default-2',
        data: 'https://images.unsplash.com/photo-1593341646782-e0b495cff86d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        caption: 'Volleyball Final Match',
        uploader: 'Ramesh'
      }
    ];
  },

  async addPhoto(photo) {
    if (this.hasSupabase) {
      const res = await this.supabaseRequest('photos', {
        method: 'POST',
        body: JSON.stringify(photo)
      });
      if (res && res[0]) return res[0];
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(photo)
        });
        if (res.ok) return await res.json();
      } catch (err) {}
    }

    const photos = await this.getPhotos();
    photos.unshift(photo);
    localStorage.setItem('lfc_photos', JSON.stringify(photos));
    return photo;
  },

  async deletePhoto(id) {
    if (this.hasSupabase) {
      await this.supabaseRequest(`photos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    if (this.isLocalServer) {
      try {
        const res = await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) return true;
      } catch (err) {}
    }

    const photos = await this.getPhotos();
    const filtered = photos.filter(p => p.id !== id);
    localStorage.setItem('lfc_photos', JSON.stringify(filtered));
    return true;
  }
};

window.API = API;
