// A stand-in for the chrome.* APIs so the popup and the in-page UI can be developed
// in a normal tab. The "background" runs potions straight in this page.
(function () {
  const KEY = 'wp-dev-storage';
  const listeners = { storage: [], message: [] };
  const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');

  const storage = {
    local: {
      async get(key) {
        const all = read();
        return key ? { [key]: all[key] } : all;
      },
      async set(obj) {
        const all = read();
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: all[k], newValue: v };
          all[k] = v;
        }
        localStorage.setItem(KEY, JSON.stringify(all));
        listeners.storage.forEach((fn) => fn(changes, 'local'));
      },
    },
    onChanged: { addListener: (fn) => listeners.storage.push(fn) },
  };

  const run = (code) => (0, eval)(code);
  const runPotion = (potion, opts) => WP.brew.sources(potion, opts).forEach((s) => run(s.code));
  const hub = () => globalThis[Symbol.for('web-potions')];

  const background = {
    status: () => {
      const out = {};
      for (const [id, p] of Object.entries(hub()?.potions || {})) out[id] = { live: p.live, mode: p.mode };
      return { userScripts: !window.WP_DEV_NO_USERSCRIPTS, running: out };
    },
    preview: ({ potion }) => runPotion(potion, { mode: 'preview', customJs: false }),
    stop: ({ id }) => hub()?.potions?.[id]?.stop(),
    async restore({ id }) {
      hub()?.potions?.[id]?.stop();
      const p = await WP.store.get(id);
      if (p?.enabled && WP.match.test(p.sites, location.href)) runPotion(p, { mode: 'auto' });
    },
    async test({ potion }) {
      runPotion(potion, { mode: 'preview', customJs: true });
      await new Promise((r) => setTimeout(r, Math.min(potion.delay || 0, 3000) + 200));
      const s = hub()?.potions?.[potion.id];
      return { ok: !s?.error, runs: s?.runs || 0, error: s?.error || null };
    },
    async drink({ id }) {
      runPotion(await WP.store.get(id), { mode: 'manual' });
    },
    async toggle({ id, enabled }) {
      const p = await WP.store.patch(id, { enabled });
      if (enabled) runPotion(p, { mode: 'auto' });
      else hub()?.potions?.[id]?.stop();
    },
    open: ({ action, id }) => window.wpDev?.(action, id),
    diagnose: () => ({ findings: window.WPUI?.diagnoseSummary?.() || [{ kind: 'login', label: 'Login wall' }, { kind: 'scroll', label: 'Scrolling is locked' }] }),
    frames: () => {},
    openSetup: () => {},
  };

  window.chrome = {
    storage,
    runtime: {
      id: 'dev',
      lastError: null,
      getURL: (p) => `/extension/${p}`,
      getManifest: () => ({ version: '0.2.0-dev' }),
      openOptionsPage: () => (location.href = '/dev/options.html'),
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      sendMessage(msg, cb) {
        const p = Promise.resolve()
          .then(() => background[msg.type]?.(msg))
          .then((res) => res ?? { ok: true })
          .catch((e) => ({ error: String(e.message || e) }));
        if (cb) p.then(cb);
        return p;
      },
    },
    tabs: { query: async () => [{ id: 1, url: window.WP_DEV_URL || location.href }], get: async () => ({ id: 1, url: window.WP_DEV_URL || location.href }), create: () => {} },
    commands: { getAll: (cb) => cb([{ name: 'pick', shortcut: '⌥⇧Z' }]) },
  };

  // Lets the harness trigger the in-page UI the way the background would.
  window.wpUI = (action, extra = {}) =>
    new Promise((resolve) => listeners.message.forEach((fn) => fn({ type: 'wp:ui', action, ...extra }, {}, resolve)));
})();
