(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    USERS: 'app_users',
    SESSION: 'app_session',
    REMEMBER: 'app_remember'
  };

  const DEFAULT_USERS = [
    {
      id: 'u_test',
      email: 'test@example.com',
      password: '123456',
      name: 'Test User'
    }
  ];

  const store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) {
        console.warn('Auth.store.get failed:', err);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.warn('Auth.store.set failed:', err);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn('Auth.store.remove failed:', err);
      }
    }
  };

  let seedPromise = null;

  function mergeWithDefaultUsers(users) {
    const list = Array.isArray(users) ? [...users] : [];
    const existingEmails = new Set(list.map(u => String(u.email || '').toLowerCase()));
    DEFAULT_USERS.forEach(user => {
      if (!existingEmails.has(String(user.email).toLowerCase())) {
        list.push(user);
      }
    });
    return list;
  }

  async function seedUsersFromJson() {
    try {
      const response = await fetch('users.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Unable to load users.json (${response.status})`);
      }
      const data = await response.json();
      const merged = mergeWithDefaultUsers(data);
      if (merged.length > 0) {
        store.set(STORAGE_KEYS.USERS, merged);
        return merged;
      }
    } catch (err) {
      console.warn('Auth.seedUsersFromJson failed:', err);
    }
    const fallback = mergeWithDefaultUsers(store.get(STORAGE_KEYS.USERS, []));
    if (fallback.length > 0) {
      store.set(STORAGE_KEYS.USERS, fallback);
    }
    return fallback;
  }

  function getCachedUsers() {
    const merged = mergeWithDefaultUsers(store.get(STORAGE_KEYS.USERS, []));
    if (merged.length > 0) {
      store.set(STORAGE_KEYS.USERS, merged);
    }
    return merged;
  }

  async function ensureSeedUsers() {
    const cached = getCachedUsers();
    if (cached.length > 0) return cached;

    if (!seedPromise) {
      seedPromise = seedUsersFromJson().finally(() => {
        seedPromise = null;
      });
    }
    return seedPromise;
  }

  async function findUserByEmail(email) {
    if (!email) return undefined;
    const users = await ensureSeedUsers();
    const needle = String(email).toLowerCase();
    return users.find(u => String(u.email).toLowerCase() === needle);
  }

  function createSession(user) {
    if (!user) return null;
    const session = {
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
      loginAt: Date.now()
    };
    store.set(STORAGE_KEYS.SESSION, session);
    return session;
  }

  function getSession() {
    return store.get(STORAGE_KEYS.SESSION, null);
  }

  function destroySession() {
    store.remove(STORAGE_KEYS.SESSION);
  }

  function isLoggedIn() {
    return Boolean(getSession());
  }

  function rememberSet(email, enabled) {
    if (!enabled) {
      store.remove(STORAGE_KEYS.REMEMBER);
      return;
    }
    store.set(STORAGE_KEYS.REMEMBER, {
      email,
      at: Date.now()
    });
  }

  function rememberGet() {
    return store.get(STORAGE_KEYS.REMEMBER, null);
  }

  function attachUserIconHandler(target, routes, options = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element || !routes) return;

    const {
      loggedInIcon = 'fa-user-check',
      loggedOutIcon = 'fa-user',
      iconSelector = 'i',
      loggedInTitle = 'View profile',
      loggedOutTitle = 'Sign in',
      toggleClass = 'is-logged-in'
    } = options;

    const resolveIconElement = () => {
      if (options.iconElement instanceof Element) {
        return options.iconElement;
      }
      if (typeof options.iconElement === 'string') {
        return element.querySelector(options.iconElement);
      }
      if (iconSelector === null) {
        return null;
      }
      return element.querySelector(iconSelector);
    };

    const iconElement = resolveIconElement();

    const applyState = () => {
      const logged = isLoggedIn();

      if (toggleClass) {
        element.classList.toggle(toggleClass, logged);
      }

      if (iconElement) {
        [loggedInIcon, loggedOutIcon].filter(Boolean).forEach(cls => iconElement.classList.remove(cls));
        const iconToAdd = logged ? loggedInIcon : loggedOutIcon;
        if (iconToAdd) {
          iconElement.classList.add(iconToAdd);
        }
      }

      const nextHref = logged ? routes.loggedIn : routes.loggedOut;
      if (nextHref) {
        element.setAttribute('href', nextHref);
      } else {
        element.setAttribute('href', '#');
      }

      const titleValue = logged ? loggedInTitle : loggedOutTitle;
      if (titleValue) {
        element.setAttribute('title', titleValue);
        element.setAttribute('aria-label', titleValue);
      } else {
        element.removeAttribute('title');
        element.removeAttribute('aria-label');
      }

      if (typeof options.onStateChange === 'function') {
        options.onStateChange({ loggedIn: logged, element, iconElement });
      }
    };

    applyState();

    const navigate = () => {
      const destination = isLoggedIn() ? routes.loggedIn : routes.loggedOut;
      if (destination) {
        window.location.href = destination;
      }
    };

    element.addEventListener('click', event => {
      event.preventDefault();
      navigate();
    });

    const storageHandler = event => {
      if (event.key === STORAGE_KEYS.SESSION) {
        applyState();
      }
    };
    window.addEventListener('storage', storageHandler);

    const visibilityHandler = () => {
      if (!document.hidden) {
        applyState();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    if (options.updateOnFocus) {
      element.addEventListener('focus', applyState);
      element.addEventListener('mouseenter', applyState);
    }
  }

  global.Auth = {
    STORAGE_KEYS,
    store,
    ensureSeedUsers,
    findUserByEmail,
    login: createSession,
    logout() {
    try {
      const role = localStorage.getItem('role');
      store.remove(STORAGE_KEYS.SESSION);
      localStorage.removeItem('app_session');
      localStorage.removeItem('role');
      if (role === 'user') {
        localStorage.removeItem('cartItems');
      }
      console.log(' Logout successful. Role:', role);
    } catch (err) {
      console.warn('Logout cleanup failed:', err);
    }
  },
    session: getSession,
    isLoggedIn,
    rememberSet,
    rememberGet,
    attachUserIconHandler
  };
})(window);
