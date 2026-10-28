// Potions as plain JSON files: export, share one, import.
// File shape: { "webPotions": 1, "exportedAt": "…", "potions": [ … ] }
// Import also accepts a bare array of potions or a single potion object.
(function (WP) {
  const INGREDIENTS = {
    zap: (i) => typeof i.selector === 'string' && i.selector.trim(),
    style: (i) => typeof i.selector === 'string' && i.selector.trim() && typeof i.css === 'string',
    glow: (i) => Array.isArray(i.words) && i.words.some((w) => typeof w === 'string' && w.trim()),
    unwall: () => true,
    unscroll: () => true,
    veil: () => true,
  };
  const str = (v, max = 100000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' && /^[a-z0-9_-]{4,40}$/i.test(raw.id) ? raw.id : 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
      .filter((i) => i && INGREDIENTS[i.type]?.(i))
      .map((i) => {
        const out = { type: i.type };
        if (i.selector) out.selector = str(i.selector, 2000);
        if (i.type === 'style') out.css = str(i.css, 20000);
        if (i.type === 'glow') {
          out.words = i.words.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.slice(0, 200));
          out.color = /^#[0-9a-f]{3,8}$/i.test(i.color) ? i.color : WP.brew.GLOW_COLORS[0];
        }
        if (i.type === 'veil') out.mode = i.mode === 'blank' ? 'blank' : 'blur';
        if (i.frame && typeof i.frame === 'string') out.frame = i.frame.slice(0, 500);
        return out;
      });
    return {
      id,
      name: str(raw.name, 120).trim() || 'Imported potion',
      sites: (Array.isArray(raw.sites) ? raw.sites : []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 500)),
      enabled: raw.enabled !== false,
      ingredients,
      css: str(raw.css),
      js: str(raw.js),
      repeat: num(raw.repeat),
      delay: num(raw.delay),
      world: raw.world === 'MAIN' ? 'MAIN' : 'USER_SCRIPT',
      createdAt: num(raw.createdAt) || Date.now(),
    };
  }

  function pack(potions) {
    const clean = potions.map(({ usedAt, ...p }) => p);
    return JSON.stringify({ webPotions: 1, exportedAt: new Date().toISOString(), potions: clean }, null, 2);
  }

  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("That isn't valid JSON.");
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.potions) ? data.potions : [data];
    const potions = list.map(normalize).filter(Boolean);
    if (!potions.length) throw new Error('No potions found in that file.');
    return potions;
  }

  // Same id means the same potion: it gets updated. Everything else is added.
  async function importAll(potions) {
    const list = await WP.store.all();
    let added = 0;
    let updated = 0;
    for (const p of potions) {
      const i = list.findIndex((x) => x.id === p.id);
      if (i === -1) {
        list.unshift({ ...p, updatedAt: Date.now() });
        added++;
      } else {
        list[i] = { ...list[i], ...p, updatedAt: Date.now() };
        updated++;
      }
    }
    await chrome.storage.local.set({ [WP.store.KEY]: list });
    return { added, updated };
  }

  function filename(potions) {
    const date = new Date().toISOString().slice(0, 10);
    if (potions.length === 1) {
      const slug = potions[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'potion';
      return `${slug}.potion.json`;
    }
    return `web-potions-${date}.json`;
  }

  function download(potions, doc = document) {
    const blob = new Blob([pack(potions)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename(potions);
    a.style.display = 'none';
    (doc.body || doc.documentElement).append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  WP.share = { normalize, pack, parse, importAll, filename, download };
})((self.WP = self.WP || {}));
