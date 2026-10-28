// Potions live in chrome.storage.local under one key, newest first.
(function (WP) {
  const KEY = 'potions';

  const NOUNS = ['tonic', 'elixir', 'brew', 'draught', 'philter', 'tincture', 'serum', 'potion'];

  async function all() {
    const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
    return list;
  }

  async function get(id) {
    return (await all()).find((p) => p.id === id) || null;
  }

  async function write(list) {
    await chrome.storage.local.set({ [KEY]: list });
  }

  async function save(potion) {
    const list = await all();
    const now = Date.now();
    const next = { ...potion, updatedAt: now, createdAt: potion.createdAt || now };
    const i = list.findIndex((p) => p.id === potion.id);
    if (i === -1) list.unshift(next);
    else list[i] = next;
    await write(list);
    return next;
  }

  async function patch(id, changes) {
    const list = await all();
    const i = list.findIndex((p) => p.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...changes };
    await write(list);
    return list[i];
  }

  async function remove(id) {
    await write((await all()).filter((p) => p.id !== id));
  }

  function draft(url) {
    const s = WP.match.suggest(url);
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return {
      id: 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      name: `${WP.match.siteName(url)} ${noun}`,
      sites: s ? [s.site] : [],
      enabled: true,
      ingredients: [],
      css: '',
      js: '',
      repeat: 0,
      delay: 0,
      world: 'USER_SCRIPT',
    };
  }

  // Most recently touched first: used, edited or created.
  const recency = (p) => Math.max(p.usedAt || 0, p.updatedAt || 0, p.createdAt || 0);

  WP.store = { KEY, all, get, save, patch, remove, draft, recency };
})((self.WP = self.WP || {}));
