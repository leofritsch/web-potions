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

  $('logo').append(WP.pixels.svg('potion', 1.25));
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  // --- shelf ------------------------------------------------------------------

  let confirming = null;
  async function renderShelf() {
    const potions = (await WP.store.all()).sort((a, b) => WP.store.recency(b) - WP.store.recency(a));
    const withJs = potions.filter((p) => p.js?.trim()).length;
    $('shelf-summary').textContent = potions.length
      ? `${potions.length} potion${potions.length === 1 ? '' : 's'}${withJs ? `, ${withJs} with custom JavaScript` : ''}.`
      : 'No potions yet. Create one from the toolbar on any site.';
    $('export').disabled = !potions.length;
    $('shelf').replaceChildren(
      ...potions.map((p) =>
        h(
          'li',
          {},
          h('div', { class: 'txt' }, h('span', { class: 'name' }, p.name), h('span', { class: 'sites' }, p.sites?.length ? p.sites.join(', ') : 'No sites, drink only')),
          p.js?.trim() && h('span', { class: 'tag' }, 'JS'),
          !p.enabled && h('span', { class: 'tag' }, 'off'),
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

  $('export').addEventListener('click', async () => WP.share.download(await WP.store.all()));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[WP.store.KEY]) renderShelf();
  });

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

  renderShelf();
})();
