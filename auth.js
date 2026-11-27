/**
 * Lovely Friends Club - Auth & Navigation System
 * - Member & Admin Authentication (Admin Passcode: NSPLFC)
 * - Permanent Navigation Dropdown Menu Management
 * - Responsive & Reliable across all devices & pages
 */

// Global Toggle Function (Available Immediately)
window.toggleNavMenu = function(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  if (window.Auth) {
    if (typeof window.Auth.updateNavUI === 'function') window.Auth.updateNavUI();
    if (typeof window.Auth.toggleMenu === 'function') window.Auth.toggleMenu(e);
  } else {
    const menu = document.getElementById('mobile-menu');
    if (menu) {
      if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        menu.classList.add('flex');
      } else {
        menu.classList.add('hidden');
        menu.classList.remove('flex');
      }
    }
  }
};

const Auth = {
  ADMIN_PASSWORD: 'NSPLFC',
  STORAGE_KEY: 'lfc_auth_user',

  getUser() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  isAdmin() {
    const user = this.getUser();
    return user && (user.isAdmin === true || user.role === 'Club Admin');
  },

  async login(identifier, password = '', adminCode = '') {
    const trimmedId = (identifier && identifier.trim()) ? identifier.trim() : 'Member';
    const trimmedPass = (password || '').trim();
    const trimmedAdmin = (adminCode || '').trim();

    // Strict Admin validation: if admin password was entered, it MUST be NSPLFC
    if (trimmedAdmin && trimmedAdmin !== this.ADMIN_PASSWORD) {
      return {
        success: false,
        message: 'Incorrect Admin Password!'
      };
    }

    // Admin role is ONLY granted if admin password was entered in the dedicated Admin Password box
    const wantsAdmin = (trimmedAdmin === this.ADMIN_PASSWORD);

    // Call server API if running on http
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: trimmedId,
            password: trimmedPass,
            admin_code: trimmedAdmin
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data.user));
          this.updateNavUI();
          return { success: true, user: data.user, message: data.message };
        } else if (!res.ok) {
          return { success: false, message: data.message || 'Login failed.' };
        }
      } catch (err) {
        console.warn('Server auth fallback:', err);
      }
    }

    // Offline / LocalStorage fallback
    const user = {
      identifier: trimmedId,
      isAdmin: wantsAdmin,
      role: wantsAdmin ? 'Club Admin' : 'Member'
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    this.updateNavUI();
    return {
      success: true,
      user,
      message: wantsAdmin ? 'Verified as Club Admin!' : 'Welcome to Lovely Friends Club!'
    };
  },

  enforceAuth() {
    const pathname = window.location.pathname.toLowerCase();
    const isSignInPage = pathname.endsWith('signin.html');
    const user = this.getUser();

    if (!user && !isSignInPage) {
      window.location.replace('signin.html');
      return false;
    }
    if (user && isSignInPage) {
      window.location.replace('index.html');
      return false;
    }
    return true;
  },

  logout() {
    const confirmed = confirm('Are you sure you want to sign out?');
    if (!confirmed) return; // User clicked Cancel

    localStorage.removeItem(this.STORAGE_KEY);
    this.updateNavUI();
    window.location.replace('signin.html');
  },

  toggleModalPassword() {
    const passInput = document.getElementById('auth-password');
    const eye = document.getElementById('auth-eye-icon');
    const eyeSlash = document.getElementById('auth-eye-slash-icon');
    if (!passInput) return;
    if (passInput.type === 'password') {
      passInput.type = 'text';
      if (eye) eye.classList.remove('hidden');
      if (eyeSlash) eyeSlash.classList.add('hidden');
    } else {
      passInput.type = 'password';
      if (eye) eye.classList.add('hidden');
      if (eyeSlash) eyeSlash.classList.remove('hidden');
    }
  },

  toggleModalAdminPassword() {
    const passInput = document.getElementById('auth-admin-code');
    const eye = document.getElementById('auth-admin-eye-icon');
    const eyeSlash = document.getElementById('auth-admin-eye-slash-icon');
    if (!passInput) return;
    if (passInput.type === 'password') {
      passInput.type = 'text';
      if (eye) eye.classList.remove('hidden');
      if (eyeSlash) eyeSlash.classList.add('hidden');
    } else {
      passInput.type = 'password';
      if (eye) eye.classList.add('hidden');
      if (eyeSlash) eyeSlash.classList.remove('hidden');
    }
  },

  open() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      modal.style.display = 'flex';
      modal.style.pointerEvents = 'auto';
      const input = document.getElementById('auth-identifier');
      const pass = document.getElementById('auth-password');
      const adminPass = document.getElementById('auth-admin-code');
      if (input) {
        input.value = '';
        input.focus();
      }
      if (pass) {
        pass.value = '';
      }
      if (adminPass) {
        adminPass.value = '';
      }
    }
  },

  close() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
      const errEl = document.getElementById('auth-error-msg');
      if (errEl) errEl.classList.add('hidden');
    }
  },

  injectModal() {
    if (document.getElementById('auth-modal')) return;

    const modalHtml = `
      <div id="auth-modal" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md hidden items-center justify-center p-4" style="display: none; pointer-events: none;">
        <div class="glass-card w-full max-w-md rounded-2xl p-6 md:p-8 border border-neonGreen/40 shadow-[0_0_30px_rgba(57,255,20,0.2)] relative animate-fade-in">
          
          <!-- Close Button -->
          <button onclick="Auth.close()" class="absolute top-5 right-5 text-gray-400 hover:text-white transition p-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>

          <!-- Header -->
          <div class="text-center mb-6">
            <div class="inline-block p-3 rounded-full bg-neonGreen/10 border border-neonGreen/30 mb-3 shadow-[0_0_15px_rgba(57,255,20,0.2)]">
              <svg class="w-8 h-8 text-neonGreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <h3 class="font-bebas text-3xl md:text-4xl text-white tracking-wider">CLUB <span class="text-neonYellow">SIGN IN</span></h3>
            <p class="font-inter text-gray-400 text-xs mt-1">Sign in with your phone no or email</p>
          </div>

          <!-- Error Message Alert -->
          <div id="auth-error-msg" class="hidden mb-4 p-3 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-inter text-center"></div>

          <!-- Form -->
          <form id="auth-form" class="space-y-4" onsubmit="Auth.handleFormSubmit(event)" autocomplete="off">
            <input type="text" name="fake_modal_user" tabindex="-1" aria-hidden="true" autocomplete="off" style="position:absolute; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;">
            <input type="password" name="fake_modal_pass" tabindex="-1" aria-hidden="true" autocomplete="new-password" style="position:absolute; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;">

            <div>
              <label for="auth-identifier" class="block font-inter text-xs text-gray-300 mb-1.5 uppercase tracking-wider font-semibold">Phone No or Email:</label>
              <input type="text" id="auth-identifier" name="modal_user_login" placeholder="Enter phone no or email" required autocomplete="off"
                class="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-3 focus:outline-none focus:border-neonGreen transition font-inter">
            </div>

            <div>
              <label for="auth-password" class="block font-inter text-xs text-gray-300 mb-1.5 uppercase tracking-wider font-semibold">Password:</label>
              <div class="relative">
                <input type="password" id="auth-password" name="modal_user_pass" placeholder="Enter password" required autocomplete="new-password"
                  class="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-neonGreen transition font-inter">
                <button type="button" onclick="Auth.toggleModalPassword()" class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-white focus:outline-none cursor-pointer">
                  <svg id="auth-eye-icon" class="h-5 w-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg id="auth-eye-slash-icon" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Admin Password Field -->
            <div>
              <label for="auth-admin-code" class="block font-inter text-xs text-neonYellow mb-1.5 uppercase tracking-wider font-semibold">Admin Password:</label>
              <div class="relative">
                <input type="password" id="auth-admin-code" name="modal_admin_pass" placeholder="Enter admin password" autocomplete="new-password"
                  class="w-full bg-gray-900 border border-yellow-500/50 text-white text-sm rounded-lg px-4 py-3 pr-12 focus:outline-none focus:border-neonYellow transition font-inter">
                <button type="button" onclick="Auth.toggleModalAdminPassword()" class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-white focus:outline-none cursor-pointer">
                  <svg id="auth-admin-eye-icon" class="h-5 w-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg id="auth-admin-eye-slash-icon" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit"
              class="w-full bg-neonGreen text-charcoal font-bebas text-xl py-3 rounded-lg hover:bg-green-400 transition transform hover:scale-[1.02] shadow-[0_0_15px_#39ff14] mt-2 cursor-pointer font-bold">
              SIGN IN
            </button>
          </form>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Close on backdrop click
    const modal = document.getElementById('auth-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) Auth.close();
    });
  },

  async handleFormSubmit(e) {
    e.preventDefault();
    const identifier = (document.getElementById('auth-identifier') ? document.getElementById('auth-identifier').value : '').trim();
    const password = (document.getElementById('auth-password') ? document.getElementById('auth-password').value : '').trim();
    const adminCode = (document.getElementById('auth-admin-code') ? document.getElementById('auth-admin-code').value : '').trim();
    const errEl = document.getElementById('auth-error-msg');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!identifier) {
      if (errEl) { errEl.innerText = 'Please enter your phone number or email.'; errEl.classList.remove('hidden'); }
      return;
    }

    if (adminCode && adminCode !== this.ADMIN_PASSWORD) {
      if (errEl) {
        errEl.innerText = 'Incorrect Admin Password!';
        errEl.classList.remove('hidden');
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'CHECKING...';

    const result = await this.login(identifier, password, adminCode);
    submitBtn.disabled = false;
    submitBtn.innerText = 'SIGN IN';

    if (!result.success) {
      if (errEl) {
        errEl.innerText = result.message;
        errEl.classList.remove('hidden');
      }
    } else {
      if (errEl) errEl.classList.add('hidden');
      this.close();
      const roleText = result.user.isAdmin ? 'Admin' : 'Member';
      alert(`Welcome, ${result.user.identifier}! You are signed in as ${roleText}.`);
      window.location.reload();
    }
  },

  toggleMenu(e) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    const mobileMenu = document.getElementById('mobile-menu');
    if (!mobileMenu) return;
    if (mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.remove('hidden');
      mobileMenu.classList.add('flex');
    } else {
      mobileMenu.classList.add('hidden');
      mobileMenu.classList.remove('flex');
    }
  },

  updateNavUI() {
    const user = this.getUser();
    const isAdmin = this.isAdmin();
    const roleText = isAdmin ? 'ADMIN' : 'MEMBER';
    const roleColor = isAdmin ? 'text-neonGreen' : 'text-cyan-400';
    const dotBg = isAdmin ? 'bg-neonGreen' : 'bg-cyan-400';
    const badgeBg = isAdmin ? 'bg-green-950/80 text-neonGreen border-neonGreen/40' : 'bg-blue-950/80 text-cyan-400 border-cyan-400/40';

    // 1. Top Navbar Role Badge (next to MENU button)
    const navBadge = document.getElementById('nav-auth-badge');
    if (navBadge) {
      if (user) {
        navBadge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeBg} shadow-sm">
            <span class="w-2 h-2 rounded-full ${dotBg} ${isAdmin ? 'animate-pulse' : ''}"></span>
            ${isAdmin ? 'Admin' : 'Member'}
          </span>
        `;
      } else {
        navBadge.innerHTML = '';
      }
    }

        // 2. Dropdown Mobile Menu Header Status
    const roleStatusEl = document.getElementById('menu-role-status');
    const roleDotEl = document.getElementById('menu-role-dot');
    const roleNameEl = document.getElementById('menu-role-name');
    const userIdEl = document.getElementById('menu-user-id');

    if (roleStatusEl && roleDotEl && roleNameEl) {
      roleStatusEl.className = `font-bebas text-xl tracking-wider ${roleColor} flex items-center gap-2`;
      roleDotEl.className = `w-2.5 h-2.5 rounded-full ${dotBg} ${isAdmin ? 'animate-pulse' : ''}`;
      roleNameEl.innerText = roleText;
      if (userIdEl) {
        userIdEl.innerText = (user && user.identifier) ? user.identifier : '';
      }
    }

    // 3. Dropdown Mobile Menu
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      const pathname = window.location.pathname.toLowerCase();
      const filename = pathname.split('/').pop() || 'index.html';

      const navLinks = [
        { href: 'index.html', label: 'HOME', file: 'index.html' },
        { href: 'live-score.html', label: 'LIVE MATCH SCORE', file: 'live-score.html' },
        { href: 'players-list.html', label: 'PLAYERS LIST', file: 'players-list.html' },
        { href: 'stats.html', label: 'MATCH STATS', file: 'stats.html' },
        { href: 'gallery.html', label: 'GALLERY', file: 'gallery.html' },
        { href: 'squad.html', label: 'SQUAD & INFO', file: 'squad.html' }
      ];

      const linksHtml = navLinks.map(link => {
        const isActive = (filename === link.file) || (filename === '' && link.file === 'index.html');
        return `
          <a href="${link.href}" class="px-6 py-3.5 border-b border-gray-800/50 flex justify-between items-center transition ${isActive ? 'text-neonYellow bg-gray-900/60 font-bold' : 'text-white hover:text-neonYellow hover:bg-gray-800/40'}">
            <span>${link.label}</span>
            ${isActive ? '<span class="w-2 h-2 rounded-full bg-neonYellow"></span>' : ''}
          </a>
        `;
      }).join('');

      mobileMenu.innerHTML = `
        <!-- Profile Header -->
        <div class="px-6 py-4 border-b border-gray-800/80 bg-gray-950/60 flex items-center justify-between">
          <span class="font-bebas text-xl tracking-wider ${roleColor} flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${dotBg} ${isAdmin ? 'animate-pulse' : ''}"></span>
            ${roleText}
          </span>
          <span class="font-inter text-xs text-gray-400 font-normal">
            ${user && user.identifier ? user.identifier : ''}
          </span>
        </div>

        <!-- Navigation Links -->
        <div class="flex flex-col">
          ${linksHtml}
        </div>

        <!-- Sign Out Button -->
        <div class="p-4 border-t border-gray-800/80 bg-gray-950/60 flex justify-center">
          <button type="button" onclick="Auth.logout()" class="w-full text-center border border-red-500/80 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-bebas text-lg tracking-wider px-4 py-2 rounded-lg transition cursor-pointer">
            SIGN OUT
          </button>
        </div>
      `;
    }

    // 3. Attach click event to mobile-menu-btn safely
    const btn = document.getElementById('mobile-menu-btn');
    if (btn) {
      btn.onclick = (e) => this.toggleMenu(e);
    }
  },

  init() {
    this.injectModal();
    this.updateNavUI();
  }
};

window.Auth = Auth;
Auth.enforceAuth();

// Close dropdown when clicking anywhere outside
if (!window._navMenuOutsideListenerAttached) {
  window._navMenuOutsideListenerAttached = true;
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobile-menu');
    const btn = document.getElementById('mobile-menu-btn');
    if (menu && !menu.classList.contains('hidden')) {
      if (btn && (btn === e.target || btn.contains(e.target))) return;
      if (menu === e.target || menu.contains(e.target)) return;
      menu.classList.add('hidden');
      menu.classList.remove('flex');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.init());
} else {
  Auth.init();
}
