(async function () {
  const $ = (id) => document.getElementById(id);

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
    return el;
  }

  const CATALOG_URL = self.WP_CATALOG_URL || 'https://raw.githubusercontent.com/leofritsch/web-potions/main/potions/catalog.json';

  $('logo').append(WP.pixels.svg('potion', 1.25));
  $('search-icon').append(WP.pixels.svg('search', 2));
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  // --- tabs ---------------------------------------------------------------------

  // The popup's Browse button opens #browse; the gear and Chrome's own Options open settings.
  const TITLES = { browse: 'Browse potions', settings: 'Web Potions settings' };
  function showTab() {
    const tab = location.hash === '#browse' ? 'browse' : 'settings';
    for (const name of Object.keys(TITLES)) {
      $(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
      $(`${name}-panel`).hidden = name !== tab;
    }
    document.title = TITLES[tab];
    if (tab === 'browse') {
      $('search').focus();
      if (!catalog) loadCatalog();
    }
  }
  addEventListener('hashchange', showTab);

  // --- browse -------------------------------------------------------------------

  const ICONS = { zap: 'picker', style: 'brush', glow: 'glow', unscroll: 'scroll', veil: 'veil' };
  const iconFor = (p) =>
    h('span', { class: 'ico' }, WP.pixels.svg(ICONS[p.ingredients?.[0]?.type] || (p.js?.trim() ? 'wand' : p.css?.trim() ? 'brush' : 'potion'), 1.5));
  const sitesText = (p) => (p.sites?.length ? p.sites.join(', ') : 'No sites, drink only');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const query = () => $('search').value.trim();
  const found = (p) => {
    const q = query().toLowerCase();
    return !q || [p.name, p.description, ...(p.sites || [])].some((t) => t?.toLowerCase().includes(q));
  };

  let shelf = [];
  let catalog = null; // fetched when the Browse tab first opens
  let catalogFailed = false;
  const gotten = new Set(); // taken from the catalog during this visit
  let confirming = null;

  async function loadShelf() {
    shelf = (await WP.store.all()).sort((a, b) => WP.store.recency(b) - WP.store.recency(a));
    renderShelf();
    renderCatalog();
    renderExport();
  }

  function renderShelf() {
    const list = shelf.filter(found);
    $('shelf-summary').textContent = shelf.length ? plural(shelf.length, 'potion') : '';
    $('shelf-empty').hidden = list.length > 0;
    $('shelf-empty').textContent = shelf.length
      ? `None of your potions match “${query()}”.`
      : 'Nothing on your shelf yet. Get a potion from the catalog below, or brew your own from the toolbar on any site.';
    $('shelf').replaceChildren(
      ...list.map((p) =>
        h(
          'li',
          {},
          iconFor(p),
          h('div', { class: 'txt' }, h('span', { class: 'name' }, p.name), h('span', { class: 'sites' }, sitesText(p))),
          p.ai && h('span', { class: 'tag', title: `Saved by an AI on ${p.ai}` }, 'AI'),
          p.js?.trim() && h('span', { class: 'tag' }, 'JS'),
          // Drink-only potions have nothing to switch: they only run when you drink them.
          p.sites?.length > 0 &&
            h('input', {
              type: 'checkbox',
              class: 'switch',
              checked: p.enabled,
              title: p.enabled ? 'On: runs by itself on its sites' : 'Off',
              'aria-label': `${p.name} on or off`,
              onchange: (e) => chrome.runtime.sendMessage({ type: 'toggle', id: p.id, enabled: e.target.checked }),
            }),
          confirming === p.id
            ? [
                h('span', { class: 'sub' }, 'Delete for good?'),
                h('button', { class: 'btn sm', onclick: () => ((confirming = null), renderShelf()) }, 'Keep it'),
                h(
                  'button',
                  {
                    class: 'btn sm danger',
                    onclick: async () => {
                      confirming = null;
                      await WP.store.remove(p.id);
                    },
                  },
                  'Delete',
                ),
              ]
            : [
                h('button', { class: 'btn sm', title: 'Download this potion as a file to share', onclick: () => WP.share.download([p]) }, 'Share'),
                h('button', { class: 'btn quiet', onclick: () => ((confirming = p.id), renderShelf()) }, 'Delete'),
              ],
        ),
      ),
    );
  }

  async function loadCatalog() {
    catalogFailed = false;
    catalog = null;
    renderCatalog();
    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The catalog is data fetched from GitHub, so it never gets to bring code along.
      catalog = WP.share.parse(await res.text()).map((p) => ({ ...p, js: '' }));
    } catch (e) {
      console.warn('[Web Potions] catalog:', e);
      catalogFailed = true;
    }
    renderCatalog();
  }

  function where(p) {
    const hosts = p.sites.map((s) => s.replace(/^\*\./, '').replace(/\/\*$/, ''));
    return hosts.length ? `It runs by itself on ${hosts.join(', ')}.` : 'Drink it from the toolbar on any page.';
  }

  function renderCatalog() {
    const status = $('catalog-status');
    const list = (catalog || []).filter(found);
    status.hidden = !!(catalog && list.length);
    if (catalogFailed)
      status.replaceChildren(
        "Couldn't reach GitHub, so the catalog can't load right now. ",
        h('button', { class: 'btn quiet', onclick: loadCatalog }, 'Try again'),
      );
    else if (!catalog) status.replaceChildren('Fetching the catalog from GitHub…');
    else status.replaceChildren(`Nothing in the catalog matches “${query()}”.`);
    const mine = new Set(shelf.map((p) => p.id));
    $('catalog').replaceChildren(
      ...list.map((p) =>
        h(
          'li',
          {},
          iconFor(p),
          h(
            'div',
            { class: 'txt' },
            h('span', { class: 'name' }, p.name),
            p.description && h('span', { class: 'desc' }, p.description),
            h('span', { class: 'sites' }, sitesText(p)),
            gotten.has(p.id) && mine.has(p.id) && h('span', { class: 'ok' }, `Added. ${where(p)}`),
          ),
          p.js?.trim() && h('span', { class: 'tag', title: 'Runs custom JavaScript' }, 'JS'),
          mine.has(p.id)
            ? h('span', { class: 'got' }, 'On your shelf')
            : h(
                'button',
                {
                  class: 'btn sm primary',
                  'aria-label': `Get ${p.name}`,
                  onclick: async () => {
                    gotten.add(p.id);
                    await WP.share.importAll([p]);
                  },
                },
                'Get',
              ),
        ),
      ),
    );
  }

  $('search').value = new URLSearchParams(location.search).get('q') || '';
  $('search').addEventListener('input', () => {
    renderShelf();
    renderCatalog();
  });

  // --- back up ------------------------------------------------------------------

  function renderExport() {
    const withJs = shelf.filter((p) => p.js?.trim()).length;
    $('export').disabled = !shelf.length;
    $('export-summary').textContent = shelf.length
      ? `Saves all ${plural(shelf.length, 'potion')}${withJs ? ` (${withJs} with custom JavaScript)` : ''} to one .json file you can import anywhere.`
      : 'Nothing to back up yet.';
  }

  $('export').addEventListener('click', () => WP.share.download(shelf));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[WP.store.KEY]) loadShelf();
  });

  await loadShelf();
  showTab();

  // --- import -----------------------------------------------------------------

  // Parse first and show what's inside; nothing is stored until "Import" is clicked.
  function preview(text) {
    const box = $('preview');
    if (!text.trim()) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    let potions;
    try {
      potions = WP.share.parse(text);
    } catch (e) {
      box.className = 'preview bad';
      box.replaceChildren(h('p', {}, e.message));
      return;
    }
    const withJs = potions.filter((p) => p.js.trim());
    box.className = 'preview';
    box.replaceChildren(
      h('p', {}, h('b', {}, `${potions.length} potion${potions.length === 1 ? '' : 's'}: `), potions.map((p) => p.name).join(', ')),
      withJs.length > 0 &&
        h(
          'p',
          { class: 'warn' },
          `${withJs.length === 1 ? 'One of them runs' : `${withJs.length} of them run`} custom JavaScript on the sites they match. Only import potions from people you trust.`,
        ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              const { added, updated } = await WP.share.importAll(potions);
              $('paste').value = '';
              box.className = 'preview';
              box.replaceChildren(
                h('p', { class: 'ok' }, `Imported. ${added} added${updated ? `, ${updated} updated` : ''}.`),
              );
            },
          },
          `Import ${potions.length === 1 ? 'it' : `all ${potions.length}`}`,
        ),
        h(
          'button',
          {
            class: 'btn quiet',
            onclick: () => {
              $('paste').value = '';
              box.hidden = true;
            },
          },
          'Cancel',
        ),
      ),
    );
  }

  $('paste').addEventListener('input', (e) => preview(e.target.value));
  $('file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    $('paste').value = text;
    preview(text);
    e.target.value = '';
  });

  // --- AI mode ------------------------------------------------------------------

  // The instructions ship inside the extension, so they always match this version and
  // never depend on a link working.
  const AI_INTRO = "Here's how to use Web Potions, a Chrome extension I have installed in my real Chrome. Use it for what I'm asking in this message.\n\n";
  async function aiInstructions() {
    const text = await (await fetch(chrome.runtime.getURL('skill/web-potions/SKILL.md'))).text();
    return AI_INTRO + text.replace(/^---[\s\S]*?---\s*/, '');
  }
  const showConnect = (on) => {
    $('ai-connect').hidden = !on;
    $('ai-sites').hidden = !on;
  };
  const { aiMode } = await chrome.storage.local.get('aiMode');
  $('ai-mode').checked = aiMode === true;
  showConnect(aiMode === true);
  $('ai-mode').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ aiMode: e.target.checked });
    showConnect(e.target.checked);
  });
  $('ai-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(await aiInstructions());
    $('ai-copied').textContent = 'Copied. Paste them into your AI.';
    setTimeout(() => ($('ai-copied').textContent = ''), 2600);
  });

  async function renderAllowedSites() {
    const { aiAllowedSites: sites = [] } = await chrome.storage.local.get('aiAllowedSites');
    $('ai-site-empty').hidden = sites.length > 0;
    $('ai-site-list').replaceChildren(
      ...sites.map((site) =>
        h(
          'li',
          {},
          h('span', { class: 'txt' }, h('span', { class: 'sites' }, site)),
          h('button', { class: 'btn sm', 'aria-label': `Stop allowing ${site}`, onclick: () => chrome.storage.local.set({ aiAllowedSites: sites.filter((s) => s !== site) }) }, 'Remove'),
        ),
      ),
    );
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.aiAllowedSites) renderAllowedSites();
  });
  renderAllowedSites();

  const hostOf = (pattern) => pattern.replace(/^\*\./, '').replace(/\/\*$/, '');
  $('ai-popular-count').textContent = WP.popularSites.length;
  $('ai-popular-list').textContent = WP.popularSites.map(hostOf).join(', ');
  const { aiAskOnPopularSites } = await chrome.storage.local.get('aiAskOnPopularSites');
  $('ai-popular').checked = !aiAskOnPopularSites;
  $('ai-popular').addEventListener('change', (e) => chrome.storage.local.set({ aiAskOnPopularSites: !e.target.checked }));

  // --- shortcut and permissions -------------------------------------------------

  $('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  chrome.commands?.getAll?.((cmds) => {
    const pick = cmds.find((c) => c.name === 'pick');
    $('shortcut').textContent = pick?.shortcut || 'Not set';
  });
  const { userScripts } = (await chrome.runtime.sendMessage({ type: 'status' }).catch(() => null)) || {};
  $('perm').replaceChildren(
    userScripts
      ? h('span', { class: 'on' }, 'On')
      : h(
          'span',
          {},
          'Off. ',
          h('button', { class: 'btn quiet', onclick: () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }) }, 'Turn it on in the details page'),
        ),
  );
})();
