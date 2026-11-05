// Checks the limits on AI mode, using the real background code with chrome.* faked:
//
//   node scripts/test-ai-bridge.mjs
//
// These are the rules that stop a hostile page from reaching beyond its own site, so
// they get a test even though nothing else here has one.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;

function makeBrowser() {
  const local = {};
  const session = {};
  const area = (data) => ({
    get: async (key) => {
      if (key == null) return { ...data };
      return Object.fromEntries([key].flat().map((k) => [k, data[k] === undefined ? undefined : structuredClone(data[k])]));
    },
    set: async (obj) => {
      Object.assign(data, structuredClone(obj));
      if (data === local) for (const fn of browser.listeners.storage) await fn(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { newValue: v }])), 'local');
    },
    remove: async (keys) => [keys].flat().forEach((k) => delete data[k]),
  });
  const event = () => ({ addListener() {} });
  const browser = {
    local,
    session,
    executed: [],
    openTabs: [],
    listeners: { storage: [] },
    // Flips AI mode the way the settings page does.
    setAiMode: (on) => browser.chrome.storage.local.set({ aiMode: on }),
    windows: [],
  };
  const runScript = async (opts) => {
    browser.executed.push(opts);
    if (opts.func) return [{ result: opts.func.toString().includes('WPUI?.ai') ? true : browser.pageResult ?? null }];
    return [{ result: null }];
  };
  browser.chrome = {
    runtime: {
      id: 'test',
      getManifest: () => ({ version: 'test' }),
      getURL: (p) => `ext://${p}`,
      onMessage: { addListener: (fn) => (browser.listeners.message = fn) },
      onInstalled: event(),
      onStartup: event(),
    },
    storage: { local: area(local), session: area(session), onChanged: { addListener: (fn) => browser.listeners.storage.push(fn) } },
    userScripts: {
      getScripts: async () => [],
      configureWorld: async () => {},
      unregister: async () => {},
      register: async () => {},
      execute: async (opts) => {
        browser.executed.push(opts);
        return [{ result: {} }];
      },
    },
    scripting: { executeScript: runScript },
    tabs: {
      get: async (id) => ({ id, url: browser.url }),
      query: async () => browser.openTabs,
      create: async () => {},
      sendMessage: async () => {},
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
    },
    windows: {
      onFocusChanged: event(),
      create: async ({ url }) => {
        browser.windows.push(url);
        return { id: browser.windows.length };
      },
      update: async (id) => (browser.openWindows === false ? Promise.reject(new Error('gone')) : { id }),
    },
    action: {
      setBadgeText: ({ text }) => (browser.toolbar = text),
      setBadgeBackgroundColor() {},
      setBadgeTextColor() {},
    },
    contextMenus: { removeAll: async () => {}, create() {}, onClicked: event() },
    commands: { onCommand: event() },
    webNavigation: { onCommitted: event(), onDOMContentLoaded: event() },
  };
  const ctx = { chrome: browser.chrome, crypto, console: { ...console, warn() {} }, setTimeout: (fn) => setTimeout(fn, 0), clearTimeout, URL, Date, structuredClone };
  ctx.self = ctx;
  ctx.importScripts = (...files) => files.forEach((f) => vm.runInContext(readFileSync(`${root}extension/${f}`, 'utf8'), ctx));
  vm.createContext(ctx);
  ctx.importScripts('background.js');
  browser.ctx = ctx;
  return browser;
}

// Sends a message the way a content script would, from the top frame of tab 7.
function send(browser, msg, { url = browser.url, frameId = 0, tabId = 7 } = {}) {
  return new Promise((resolve) => {
    const sender = { tab: { id: tabId, url }, frameId, url };
    browser.listeners.message(msg, sender, resolve);
  });
}
const call = (browser, cmd, ...args) => send(browser, { type: 'ai-call', cmd, args });

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

async function unlocked(url = 'https://www.reddit.com/r/all') {
  const b = makeBrowser();
  b.url = url;
  b.local.aiMode = true;
  await send(b, { type: 'ai-unlock' });
  return b;
}
const shelf = (b) => b.local.potions || [];
const zap = { ingredients: [{ type: 'zap', selector: '.popup' }] };
const badgeCalls = (b) => b.executed.filter((o) => o.args?.[0] === 'badge').map((o) => o.args[1][0]);

const { WP } = makeBrowser().ctx;

console.log('Patterns');
await test('within: only the current host and its subdomains', () => {
  const yes = [['*.reddit.com/*', 'https://www.reddit.com/'], ['reddit.com/r/*', 'https://reddit.com/x'], ['www.reddit.com/*', 'https://reddit.com/'], ['old.reddit.com/*', 'https://old.reddit.com/'], ['https://reddit.com/*', 'https://reddit.com/'], ['127.0.0.1:8765/*', 'http://127.0.0.1:8765/a']];
  const no = [
    ['*', 'https://reddit.com/'],
    ['*/*', 'https://reddit.com/'],
    ['*.com/*', 'https://reddit.com/'],
    ['*reddit.com/*', 'https://reddit.com/'],
    ['evil.com/*', 'https://reddit.com/'],
    ['reddit.com.evil.com/*', 'https://reddit.com/'],
    ['reddit.com@evil.com/*', 'https://reddit.com/'],
    ['*.github.io/*', 'https://evil.github.io/'],
    ['*.reddit.com/*', 'https://old.reddit.com/'],
    ['file:///etc/*', 'https://reddit.com/'],
    ['', 'https://reddit.com/'],
  ];
  for (const [p, u] of yes) assert.equal(WP.match.within(p, u), true, `${p} on ${u}`);
  for (const [p, u] of no) assert.equal(WP.match.within(p, u), false, `${p} on ${u}`);
});

console.log('Before the key press');
await test('page messages get silence, so sites cannot detect the extension', async () => {
  const b = makeBrowser();
  b.url = 'https://evil.com/';
  b.local.aiMode = true;
  for (const cmd of ['hello', 'save', 'nonsense']) assert.equal((await call(b, cmd, zap)).silent, true, cmd);
  assert.equal(shelf(b).length, 0);
});

console.log('With AI mode off');
await test('after the key press the AI is told to ask the user', async () => {
  const b = makeBrowser();
  b.url = 'https://reddit.com/';
  await send(b, { type: 'ai-unlock' });
  const res = await call(b, 'hello');
  assert.equal(res.aiMode, false);
  assert.match(res.tellUser, /switch on AI mode/);
  assert.equal((await call(b, 'save', zap)).ok, false);
  assert.equal(shelf(b).length, 0);
});
await test('turning it on works without pressing the keys again', async () => {
  const b = makeBrowser();
  b.url = 'https://reddit.com/';
  await send(b, { type: 'ai-unlock' });
  b.local.aiMode = true;
  assert.equal((await call(b, 'hello')).ok, true);
});

console.log('Unlocked tab');
await test('save needs no click, and is on and tagged', async () => {
  const b = await unlocked();
  const res = await call(b, 'save', { name: 'No popup', ...zap });
  assert.equal(res.ok, true, res.error);
  const [p] = shelf(b);
  assert.deepEqual([...p.sites], ['*.reddit.com/*']);
  assert.equal(p.enabled, true);
  assert.equal(p.ai, 'reddit.com');
  assert.match(res.tellUser, /puzzle piece/);
  assert.ok(res.picture && res.guide);
});
await test('save refuses other sites and every-site patterns', async () => {
  const b = await unlocked();
  for (const sites of [['*'], ['evil.com/*'], ['*.reddit.com/*', 'accounts.google.com/*'], '*'])
    assert.match((await call(b, 'save', { sites, ...zap })).error, /beyond this site/, String(sites));
  assert.equal(shelf(b).length, 0);
});
await test('save refuses iframe rules', async () => {
  const b = await unlocked();
  const res = await call(b, 'save', { ingredients: [{ type: 'style', selector: 'input', css: 'color: red', frame: '*.bank.com/*' }] });
  assert.match(res.error, /iframes/);
});
await test('drink-only potions can use CSS but not JavaScript', async () => {
  const b = await unlocked();
  assert.match((await call(b, 'save', { sites: [], js: 'steal()' })).error, /needs a site/);
  assert.equal((await call(b, 'save', { sites: [], css: 'a { color: red }' })).ok, true);
});
await test("can't touch a potion that also runs on other sites", async () => {
  const b = await unlocked();
  b.local.potions = [{ id: 'everywhere1', name: 'Mine', sites: ['*'], enabled: true, ingredients: [], css: '', js: 'good()' }];
  assert.match((await call(b, 'save', { id: 'everywhere1', js: 'bad()' })).error, /only the user/);
  assert.match((await call(b, 'try', { id: 'everywhere1', js: 'bad()' })).error, /only the user/);
  assert.match((await call(b, 'switch', 'everywhere1', false)).error, /only the user/);
  assert.equal(shelf(b)[0].js, 'good()');
  assert.equal(shelf(b)[0].enabled, true);
});
await test("can't touch the user's drink-only potions, which run wherever they're drunk", async () => {
  const b = await unlocked();
  b.local.potions = [{ id: 'drinkonly1', name: 'Mine', sites: [], enabled: true, ingredients: [], css: 'a{}', js: '' }];
  assert.match((await call(b, 'save', { id: 'drinkonly1', css: 'b{}' })).error, /only the user/);
});
await test('hello hides the code of potions that run elsewhere', async () => {
  const b = await unlocked();
  b.local.potions = [
    { id: 'everywhere1', name: 'Mine', sites: ['*'], enabled: true, ingredients: [], css: '', js: 'secret()' },
    { id: 'otherbsite', name: 'Other', sites: ['bank.com/*'], enabled: true, ingredients: [], css: '', js: '' },
  ];
  const { potions } = await call(b, 'hello');
  assert.equal(potions.length, 1, 'other sites stay hidden');
  assert.equal(potions[0].js, undefined);
  assert.equal(potions[0].canChange, false);
});
await test('a new potion gets its own id, so it cannot claim a catalog one', async () => {
  const b = await unlocked();
  const res = await call(b, 'save', { id: 'wp-gray-mode', ...zap });
  assert.notEqual(res.id, 'wp-gray-mode');
});
await test('there is no delete command', async () => {
  const b = await unlocked();
  assert.match((await call(b, 'delete', 'x')).error, /Unknown command/);
  assert.match((await call(b, 'constructor')).error, /Unknown command/);
});
await test('Undo removes a new potion and restores an edited one', async () => {
  const b = await unlocked();
  const { id } = await call(b, 'save', { name: 'First', ...zap });
  await send(b, { type: 'ai-undo', undo: { id, prev: null } });
  assert.equal(shelf(b).length, 0);
  const again = await call(b, 'save', { name: 'First', ...zap });
  const before = structuredClone(shelf(b)[0]);
  await call(b, 'save', { id: again.id, name: 'Changed' });
  assert.equal(shelf(b)[0].name, 'Changed');
  await send(b, { type: 'ai-undo', undo: { id: again.id, prev: before } });
  assert.equal(shelf(b)[0].name, 'First');
});

console.log('When the unlock ends');
await test('leaving the site ends it, even for the same tab', async () => {
  const b = await unlocked();
  assert.equal((await send(b, { type: 'ai-call', cmd: 'hello', args: [] }, { url: 'https://evil.com/' })).silent, true);
  assert.equal((await call(b, 'hello')).silent, true, 'stays ended after coming back');
});
await test('it runs out after 30 minutes', async () => {
  const b = await unlocked();
  b.session['ai:7'].until = Date.now() - 1;
  assert.equal((await call(b, 'hello')).silent, true);
});
await test('iframes are never heard', async () => {
  const b = await unlocked();
  assert.equal((await send(b, { type: 'ai-call', cmd: 'hello', args: [] }, { frameId: 3 })).silent, true);
});
await test('done ends it', async () => {
  const b = await unlocked();
  assert.equal((await call(b, 'done')).ok, true);
  assert.equal((await call(b, 'hello')).silent, true);
});
await test('Lock it out holds: the keys and new tabs do not get back in', async () => {
  const b = await unlocked();
  await send(b, { type: 'ai-lock' });
  assert.equal((await call(b, 'save', zap)).locked, true);
  await send(b, { type: 'ai-unlock' });
  assert.equal((await call(b, 'save', zap)).locked, true, 'pressing the keys again');
  await send(b, { type: 'ai-unlock' }, { tabId: 8 });
  assert.equal((await send(b, { type: 'ai-call', cmd: 'save', args: [zap] }, { tabId: 8 })).locked, true, 'a new tab');
  assert.equal(shelf(b).length, 0);
});
await test('a lock only covers its own site', async () => {
  const b = await unlocked();
  await send(b, { type: 'ai-lock' });
  b.url = 'https://www.bbc.com/';
  await send(b, { type: 'ai-unlock' }, { tabId: 8 });
  assert.equal((await send(b, { type: 'ai-call', cmd: 'hello', args: [] }, { tabId: 8 })).ok, true);
});
await test('flipping AI mode off and on lets an AI back in', async () => {
  const b = await unlocked();
  await send(b, { type: 'ai-lock' });
  await b.setAiMode(false);
  await b.setAiMode(true);
  await send(b, { type: 'ai-unlock' });
  assert.equal((await call(b, 'hello')).ok, true);
});

console.log('Allowing a new site');
const fromAllow = { url: 'ext://allow/allow.html?site=x' };
const answer = (b, type, site) => new Promise((resolve) => b.listeners.message({ type, site }, { url: fromAllow.url }, resolve));
const unlockedOn = async (url) => {
  const b = makeBrowser();
  b.url = url;
  b.local.aiMode = true;
  await send(b, { type: 'ai-unlock' });
  return b;
};
await test('a new site opens the Allow window, and nothing works until the user says yes', async () => {
  const b = await unlockedOn('https://smallsite.net/page');
  assert.equal(b.windows.length, 1);
  assert.match(b.windows[0], /allow\.html\?site=smallsite\.net/);
  const res = await call(b, 'hello');
  assert.equal(res.waitingForUser, true);
  assert.match(res.tellUser, /Click Allow/);
  assert.equal((await call(b, 'save', zap)).ok, false);
  assert.equal(shelf(b).length, 0);
  assert.equal(badgeCalls(b).length, 0, 'no badge yet');
  await answer(b, 'ai-allow', 'smallsite.net');
  assert.equal((await call(b, 'save', zap)).ok, true);
  assert.equal(badgeCalls(b).length, 1, 'the badge comes up once allowed');
});
await test('the yes is remembered, for that site only', async () => {
  const b = await unlockedOn('https://smallsite.net/');
  await answer(b, 'ai-allow', 'smallsite.net');
  assert.deepEqual([...b.local.aiAllowedSites], ['smallsite.net']);
  b.windows.length = 0;
  await send(b, { type: 'ai-unlock' }, { tabId: 8 });
  assert.equal(b.windows.length, 0, 'no second question');
  b.url = 'https://othersite.net/';
  await send(b, { type: 'ai-unlock' }, { tabId: 9 });
  assert.equal(b.windows.length, 1, 'another site still asks');
});
await test('only the Allow window can say yes', async () => {
  const b = await unlockedOn('https://smallsite.net/');
  await new Promise((resolve) => b.listeners.message({ type: 'ai-allow', site: 'smallsite.net' }, { tab: { id: 7, url: b.url }, frameId: 0, url: b.url }, resolve));
  assert.equal(b.local.aiAllowedSites, undefined);
  assert.equal((await call(b, 'hello')).waitingForUser, true);
});
await test('a page message can never open the window, only a key press', async () => {
  const b = await unlockedOn('https://smallsite.net/');
  b.windows.length = 0;
  b.openWindows = false;
  for (let i = 0; i < 5; i++) await call(b, 'hello');
  assert.equal(b.windows.length, 0);
});
await test('no means no, and the keys can\'t reopen the window straight away', async () => {
  const b = await unlockedOn('https://smallsite.net/');
  await answer(b, 'ai-deny', 'smallsite.net');
  assert.equal((await call(b, 'hello')).denied, true);
  b.windows.length = 0;
  await send(b, { type: 'ai-unlock' });
  assert.equal(b.windows.length, 0);
  assert.equal((await call(b, 'save', zap)).ok, false);
});
await test('the popular list skips the question, and Settings can turn that off', async () => {
  const b = await unlockedOn('https://www.youtube.com/');
  assert.equal(b.windows.length, 0);
  assert.equal((await call(b, 'hello')).ok, true);
  await b.chrome.storage.local.set({ aiAskOnPopularSites: true });
  assert.equal((await call(b, 'hello')).waitingForUser, true);
});
await test('email, banks, sign-in pages and open hosts are not on the popular list', () => {
  const on = (url) => WP.match.test(WP.popularSites, url);
  for (const url of ['https://www.google.com/search?q=x', 'https://old.reddit.com/', 'https://en.wikipedia.org/', 'https://experimentempire.com/', 'https://www.experimentempire.com/a'])
    assert.equal(on(url), true, url);
  for (const url of ['https://mail.google.com/', 'https://accounts.google.com/', 'https://docs.google.com/', 'https://www.paypal.com/', 'https://www.chase.com/', 'https://outlook.live.com/', 'https://evil.substack.com/', 'https://evil.github.io/', 'https://login.microsoftonline.com/'])
    assert.equal(on(url), false, url);
  assert.ok(WP.popularSites.length >= 95 && WP.popularSites.length <= 115, `${WP.popularSites.length} sites`);
});

console.log('Taking over from another potion');
const imported = { id: 'imported01', name: 'Imported', sites: ['*'], enabled: true, ingredients: [], css: 'a{}', js: '' };
await test('replaces leaves the old potion alone and offers the user a way to turn it off', async () => {
  const b = await unlocked();
  b.local.potions = [imported];
  const res = await call(b, 'save', { name: 'Better', ...zap, replaces: imported.id });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.replaces.name, 'Imported');
  assert.match(res.tellUser, /still on/);
  const old = shelf(b).find((p) => p.id === imported.id);
  assert.equal(old.enabled, true, 'still on until the user decides');
  assert.equal(old.css, 'a{}');
  await send(b, { type: 'ai-replace', id: imported.id });
  assert.equal(shelf(b).find((p) => p.id === imported.id).enabled, false);
});
await test('replaces warns when the old potion has a script, since that can skew a test', async () => {
  const b = await unlocked();
  b.local.potions = [imported, { ...imported, id: 'scripted01', name: 'Scripted', js: 'x()' }];
  assert.equal((await call(b, 'try', { ...zap, replaces: imported.id })).warning, undefined);
  assert.match((await call(b, 'try', { ...zap, replaces: 'scripted01' })).warning, /may already have run/);
  assert.match((await call(b, 'save', { ...zap, replaces: 'scripted01' })).warning, /may already have run/);
});
await test('replaces has to name a potion that runs on this site', async () => {
  const b = await unlocked();
  b.local.potions = [{ ...imported, sites: ['mybank.com/*'] }];
  assert.match((await call(b, 'save', { ...zap, replaces: imported.id })).error, /runs on this site/);
  assert.match((await call(b, 'try', { ...zap, replaces: 'nope000000' })).error, /runs on this site/);
});
await test('read shows what this site may change, and nothing else', async () => {
  const b = await unlocked();
  b.local.potions = [imported, { ...imported, id: 'mine000001', name: 'Mine', sites: ['*.reddit.com/*'], css: 'b{}' }, { ...imported, id: 'bank000001', name: 'Bank', sites: ['mybank.com/*'] }];
  assert.equal((await call(b, 'read', 'mine000001')).css, 'b{}');
  assert.match((await call(b, 'read', imported.id)).error, /stay private/);
  assert.match((await call(b, 'read', 'bank000001')).error, /No potion/);
  assert.equal((await call(b, 'hello')).potions.find((p) => p.id === 'mine000001').css, undefined, 'hello stays short');
});

console.log('Store rules');
await test('no wall-breaking ingredient, and old potions keep their scroll unlock', async () => {
  const b = await unlocked();
  assert.match((await call(b, 'save', { ingredients: [{ type: 'unwall' }] })).error, /invalid/);
  b.local.potions = [
    { id: 'old0000001', name: 'A', sites: ['a.com/*'], ingredients: [{ type: 'unwall' }, { type: 'zap', selector: 'b' }] },
    { id: 'old0000002', name: 'B', sites: ['a.com/*'], ingredients: [{ type: 'unwall' }, { type: 'unscroll' }] },
    { id: 'old0000003', name: 'C', sites: ['a.com/*'], ingredients: [{ type: 'veil' }] },
  ];
  await b.ctx.migrateIngredients();
  assert.deepEqual(shelf(b).map((p) => p.ingredients.map((i) => i.type)), [['unscroll', 'zap'], ['unscroll'], ['veil']]);
});
await test('nothing in the extension or the catalog pitches getting past walls', () => {
  const banned = /paywall|login wall|log ?in to (keep|continue)|wall breaker|login-wall|keep reading/i;
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  const hits = [...walk(`${root}extension`), `${root}potions/catalog.json`, `${root}README.md`]
    .filter((f) => /\.(js|json|html|css|md)$/.test(f))
    // Only the migration may still name the old ingredient, to retire it.
    .filter((f) => banned.test(readFileSync(f, 'utf8').replace('Wall breaker is gone', '')))
    .map((f) => f.replace(root, ''));
  assert.deepEqual(hits, []);
});
await test('catalog potions are plain data, with no JavaScript', () => {
  const { potions } = JSON.parse(readFileSync(`${root}potions/catalog.json`, 'utf8'));
  assert.ok(potions.length > 0);
  assert.deepEqual(potions.filter((p) => p.js?.trim()).map((p) => p.id), []);
});

console.log('What the user sees');
await test('the toolbar says AI whenever AI mode is on, and counts potions otherwise', async () => {
  const b = makeBrowser();
  b.url = 'https://reddit.com/';
  b.openTabs = [{ id: 7, url: b.url, active: true }];
  b.local.potions = [{ id: 'mine000001', name: 'Mine', sites: ['*.reddit.com/*'], enabled: true, ingredients: [] }];
  await b.ctx.buildMenus();
  assert.equal(b.toolbar, '1');
  b.local.aiMode = true;
  await b.ctx.buildMenus();
  assert.equal(b.toolbar, 'AI');
});
await test('the page badge shows after the key press only when AI mode is on', async () => {
  const off = makeBrowser();
  off.url = 'https://reddit.com/';
  await send(off, { type: 'ai-unlock' });
  assert.equal(badgeCalls(off).length, 0);
  const on = await unlocked();
  assert.equal(badgeCalls(on).length, 1);
  assert.ok(badgeCalls(on)[0] > Date.now(), 'it carries the time the unlock runs out');
});

console.log(process.exitCode ? '\nSome checks failed.' : `\n${passed} checks passed.`);
