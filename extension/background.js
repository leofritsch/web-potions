importScripts('lib/match.js', 'lib/brew.js', 'lib/store.js');

const UI_FILES = [
  'lib/match.js',
  'lib/pixels.js',
  'lib/store.js',
  'lib/brew.js',
  'lib/share.js',
  'content/dom.js',
  'content/selector.js',
  'content/diagnose.js',
  'content/picker.js',
  'content/menu.js',
  'content/panel.js',
  'content/ui.js',
];
// The lighter set that runs inside iframes: a picker and its menu, no brewing window.
const FRAME_FILES = ['lib/match.js', 'lib/pixels.js', 'lib/brew.js', 'content/dom.js', 'content/selector.js', 'content/picker.js', 'content/menu.js', 'content/frame.js'];
const WORLDS = ['USER_SCRIPT', 'MAIN'];

// --- user scripts -----------------------------------------------------------

// The API exists only once the user flips "Allow User Scripts" for this extension.
function userScriptsOn() {
  try {
    chrome.userScripts.getScripts().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// Custom scripts get the same freedom as the DevTools console, eval included.
let worldReady = false;
async function configureWorld() {
  if (worldReady) return;
  try {
    await chrome.userScripts.configureWorld({ csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline'", messaging: false });
    worldReady = true;
  } catch (e) {
    console.warn('[Web Potions] configureWorld failed:', e);
  }
}

const frameSites = (p) => [...new Set((p.ingredients || []).filter((i) => i.frame).map((i) => i.frame))];
const worldOf = (p) => (p.world === 'MAIN' ? 'MAIN' : 'USER_SCRIPT');
const hasGlow = (p) => (p.ingredients || []).some((i) => i.type === 'glow');

// One script for the top page and, when needed, a lighter one for iframes (frame
// rules and keyword glow, no custom JS). Glow follows the words into any iframe, so
// that one matches every frame and checks the top page itself.
function registrationsFor(p) {
  if (!p.enabled || !p.sites?.length) return [];
  const matches = WP.match.chromePatterns(p.sites);
  if (!matches.length) return [];
  const out = [{ id: p.id, matches, js: WP.brew.sources(p, { mode: 'auto' }), runAt: 'document_start', world: worldOf(p) }];
  if (WP.brew.hasFrames(p)) {
    const frameMatches = hasGlow(p) ? ['*://*/*'] : WP.match.chromePatterns(frameSites(p));
    if (frameMatches.length)
      out.push({
        id: `${p.id}-frames`,
        matches: frameMatches,
        js: WP.brew.sources(p, { mode: 'auto', customJs: false, framesOnly: true }),
        runAt: 'document_start',
        world: worldOf(p),
        allFrames: true,
      });
  }
  return out;
}

// Registered scripts mirror the enabled potions. Calls are queued so rapid edits
// can't interleave an unregister with another sync's register.
let syncQueue = Promise.resolve();
function requestSync() {
  syncQueue = syncQueue.then(sync, sync);
  return syncQueue;
}

async function sync() {
  if (!userScriptsOn()) return { ok: false, reason: 'userScripts' };
  await configureWorld();
  const potions = await WP.store.all();
  await chrome.userScripts.unregister();
  let registered = 0;
  for (const p of potions) {
    const scripts = registrationsFor(p);
    if (!scripts.length) continue;
    try {
      await chrome.userScripts.register(scripts);
      registered++;
    } catch (e) {
      console.warn(`[Web Potions] could not register "${p.name}":`, e);
    }
  }
  return { ok: true, registered };
}

// Cheap check used when the popup opens: re-register only if something is missing.
async function syncIfStale() {
  if (!userScriptsOn()) return;
  const [registered, potions] = await Promise.all([chrome.userScripts.getScripts(), WP.store.all()]);
  const want = potions.flatMap((p) => registrationsFor(p).map((s) => s.id));
  const have = new Set(registered.map((s) => s.id));
  if (want.length !== have.size || want.some((id) => !have.has(id))) await requestSync();
}

async function run(tabId, potion, opts) {
  return chrome.userScripts.execute({
    target: { tabId, allFrames: WP.brew.hasFrames(potion) },
    js: WP.brew.sources(potion, opts),
    world: worldOf(potion),
    injectImmediately: true,
  });
}

async function snippet(tabId, code, allFrames = true) {
  const results = await Promise.all(
    WORLDS.map((world) =>
      chrome.userScripts.execute({ target: { tabId, allFrames }, js: [{ code }], world, injectImmediately: true }).catch(() => []),
    ),
  );
  return results.flat();
}

const stopOnTab = (tabId, id) => snippet(tabId, WP.brew.snippets.stop(id));

async function runningOnTab(tabId) {
  const out = {};
  for (const r of await snippet(tabId, WP.brew.snippets.status(), false)) Object.assign(out, r.result || {});
  return out;
}

async function tabUrl(tabId) {
  try {
    return (await chrome.tabs.get(tabId)).url || '';
  } catch {
    return '';
  }
}

// --- actions shared by the popup, the page UI and the context menu --------------

async function drink(tabId, id) {
  const potion = await WP.store.get(id);
  if (!potion) throw new Error('That potion no longer exists.');
  await run(tabId, potion, { mode: 'manual' });
  await WP.store.patch(id, { usedAt: Date.now() });
  return { ok: true };
}

async function toggle(tabId, id, enabled) {
  const potion = await WP.store.patch(id, { enabled });
  if (!potion || tabId == null) return { ok: !!potion };
  if (enabled) {
    if (WP.match.test(potion.sites, await tabUrl(tabId))) await run(tabId, potion, { mode: 'auto' }).catch(() => {});
  } else {
    await stopOnTab(tabId, id);
  }
  return { ok: true };
}

// Puts the saved version of a potion back after an edit was discarded.
async function restore(tabId, id) {
  await stopOnTab(tabId, id);
  const potion = await WP.store.get(id);
  if (potion?.enabled && WP.match.test(potion.sites, await tabUrl(tabId))) await run(tabId, potion, { mode: 'auto' });
  return { ok: true };
}

async function testRun(tabId, potion) {
  await run(tabId, potion, { mode: 'preview', customJs: true });
  const wait = Math.min(Number(potion.delay) || 0, 3000) + 200;
  await new Promise((r) => setTimeout(r, wait));
  const state = (await runningOnTab(tabId))[potion.id];
  return { ok: !state?.error, runs: state?.runs || 0, error: state?.error || null, scheduled: (Number(potion.delay) || 0) > 3000 };
}

const RESTRICTED = "Chrome doesn't let extensions change this page.";

async function openUI(tabId, payload) {
  const url = await tabUrl(tabId);
  if (!WP.match.isWebUrl(url)) throw new Error(RESTRICTED);
  let loaded = false;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!self.WPUI?.ready });
    loaded = !!res?.result;
  } catch {
    throw new Error(RESTRICTED);
  }
  if (!loaded) await chrome.scripting.executeScript({ target: { tabId }, files: UI_FILES });
  try {
    // `type` last: the payload must never override it.
    await chrome.tabs.sendMessage(tabId, { ...payload, type: 'wp:ui' }, { frameId: 0 });
  } catch {
    throw new Error('Web Potions was updated since this page loaded. Refresh the page and try again.');
  }
  return { ok: true };
}

// Starts or stops the pickers inside the tab's iframes.
async function framePickers(tabId, on, frameId = null) {
  if (on) {
    const target = frameId == null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] };
    await chrome.scripting.executeScript({ target, files: FRAME_FILES }).catch(() => {});
  }
  const msg = { type: 'wp:frame', action: on === 'context' ? 'zap-context' : on ? 'start' : 'stop' };
  await chrome.tabs.sendMessage(tabId, msg, frameId == null ? undefined : { frameId }).catch(() => {});
  return { ok: true };
}

async function diagnose(tabId) {
  const url = await tabUrl(tabId);
  if (!WP.match.isWebUrl(url)) return { findings: [] };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/selector.js', 'content/diagnose.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => self.WPUI.diagnoseSummary() });
    return { findings: res?.result || [] };
  } catch {
    return { findings: [] };
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

// --- messages ---------------------------------------------------------------

const handlers = {
  async status({ tabId }) {
    const on = userScriptsOn();
    if (on) await syncIfStale();
    let running = {};
    if (on && tabId != null) running = await runningOnTab(tabId).catch(() => ({}));
    return { userScripts: on, running };
  },
  drink: ({ tabId, id }) => drink(tabId, id),
  stop: ({ tabId, id }) => stopOnTab(tabId, id).then(() => ({ ok: true })),
  toggle: ({ tabId, id, enabled }) => toggle(tabId, id, enabled),
  restore: ({ tabId, id }) => restore(tabId, id),
  preview: ({ tabId, potion }) => run(tabId, potion, { mode: 'preview', customJs: false }).then(() => ({ ok: true })),
  test: ({ tabId, potion }) => testRun(tabId, potion),
  open: ({ tabId, action, id }) => openUI(tabId, { action, id }),
  diagnose: ({ tabId }) => diagnose(tabId),
  frames: ({ tabId, on }) => framePickers(tabId, !!on),
  'frame-ingredient': ({ tabId, ingredient, frameUrl }) =>
    chrome.tabs.sendMessage(tabId, { type: 'wp:ui', action: 'add', ingredient, frameUrl }, { frameId: 0 }),
  'frame-exit': ({ tabId }) => chrome.tabs.sendMessage(tabId, { type: 'wp:ui', action: 'stop-pick' }, { frameId: 0 }),
  sync: () => requestSync(),
  async openSetup() {
    await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    return { ok: true };
  },
};
const NO_SCRIPTS_NEEDED = ['status', 'openSetup', 'open', 'diagnose', 'frames', 'frame-ingredient', 'frame-exit'];

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  const tabId = msg.tabId ?? sender.tab?.id;
  if (!userScriptsOn() && !NO_SCRIPTS_NEEDED.includes(msg.type)) {
    reply({ error: 'Turn on "Allow User Scripts" for Web Potions first.' });
    return false;
  }
  Promise.resolve(handler({ ...msg, tabId }))
    .then((res) => reply(res ?? { ok: true }))
    .catch((e) => reply({ error: String(e?.message || e) }));
  return true;
});

// --- context menu and badge ---------------------------------------------------

let menuTimer = null;
function refreshMenus() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(buildMenus, 120);
}

async function buildMenus() {
  const tab = await activeTab();
  const url = tab?.url || '';
  const potions = (await WP.store.all()).sort((a, b) => WP.store.recency(b) - WP.store.recency(a));
  const here = WP.match.isWebUrl(url) ? potions.filter((p) => WP.match.test(p.sites, url)) : [];
  const others = potions.filter((p) => !here.includes(p)).slice(0, 12);

  // The toolbar badge counts the potions running here on their own.
  if (tab?.id != null) {
    const n = here.filter((p) => p.enabled).length;
    chrome.action.setBadgeText({ tabId: tab.id, text: n ? String(n) : '' });
  }

  await chrome.contextMenus.removeAll();
  const add = (props) => chrome.contextMenus.create({ contexts: ['all'], ...props }, () => void chrome.runtime.lastError);
  add({ id: 'wp', title: 'Web Potions' });
  if (others.length) {
    add({ id: 'wp-drink', parentId: 'wp', title: 'Drink a potion' });
    for (const p of others) add({ id: `wp-d:${p.id}`, parentId: 'wp-drink', title: p.name });
    add({ id: 'wp-sep1', parentId: 'wp', type: 'separator' });
  }
  add({ id: 'wp-zap', parentId: 'wp', title: 'Remove or edit this element' });
  add({ id: 'wp-glow', parentId: 'wp', title: 'Highlight “%s” on this site', contexts: ['selection'] });
  add({ id: 'wp-pick', parentId: 'wp', title: 'Pick elements…' });
  add({ id: 'wp-brew', parentId: 'wp', title: 'Create a new potion here' });
  if (here.length) {
    add({ id: 'wp-sep2', parentId: 'wp', type: 'separator' });
    add({ id: 'wp-here', parentId: 'wp', title: 'Active here', enabled: false });
    for (const p of here) add({ id: `wp-p:${p.id}`, parentId: 'wp', type: 'checkbox', checked: !!p.enabled, title: p.name });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  const tabId = tab?.id;
  if (tabId == null) return;
  try {
    if (id === 'wp-zap' && info.frameId) {
      // Right-clicked inside an iframe: the window opens up top, the menu in the frame.
      await openUI(tabId, { action: 'ensure' });
      await framePickers(tabId, 'context', info.frameId);
    } else if (id === 'wp-zap') await openUI(tabId, { action: 'zap-context' });
    else if (id === 'wp-pick') await openUI(tabId, { action: 'pick' });
    else if (id === 'wp-brew') await openUI(tabId, { action: 'new' });
    else if (id === 'wp-glow') await openUI(tabId, { action: 'glow', words: [info.selectionText.trim()] });
    else if (id.startsWith('wp-p:')) await toggle(tabId, id.slice(5), info.checked);
    else if (id.startsWith('wp-d:')) await drink(tabId, id.slice(5));
  } catch (e) {
    console.warn('[Web Potions]', e);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'pick') return;
  const tab = await activeTab();
  if (tab?.id != null) openUI(tab.id, { action: 'pick' }).catch((e) => console.warn('[Web Potions]', e));
});

// --- lifecycle --------------------------------------------------------------

function boot() {
  chrome.action.setBadgeBackgroundColor({ color: '#9B30FF' });
  chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
  requestSync();
  refreshMenus();
}
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[WP.store.KEY]) return;
  const before = changes[WP.store.KEY].oldValue || [];
  const after = changes[WP.store.KEY].newValue || [];
  // Only touch registrations when something that affects injection changed.
  const shape = (list) => JSON.stringify(list.map(({ usedAt, updatedAt, createdAt, ...rest }) => rest));
  if (shape(before) !== shape(after)) requestSync();
  refreshMenus();
});
chrome.tabs.onActivated.addListener(refreshMenus);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) refreshMenus();
});
chrome.windows.onFocusChanged.addListener(refreshMenus);
