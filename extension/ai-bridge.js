// AI mode: an AI driving this browser can look at a page, try potions on it and save
// them, with no human click.
//
// A website's scripts can post the same messages as the AI, so a switch alone isn't
// enough. The AI first presses a real key combination, which page scripts can't fake
// (content/ctx.js checks isTrusted). That unlocks this tab for this site. Before that,
// page messages get no answer at all, so a site can't tell the extension is here. The first
// time on a site, the user also approves it in a separate window, unless it's a popular one.
//
// The site's own scripts can use the commands too while the tab is unlocked, so every
// command is limited to what that site could do to itself anyway. A save can't reach
// another site, can't touch a potion that runs elsewhere, and can't delete anything.

const AI_MODE = 'aiMode';
const AI_SITES = 'aiAllowedSites';
const AI_ASK_POPULAR = 'aiAskOnPopularSites';
const AI_DENIED_MS = 60 * 1000;
const AI_UNLOCK_MS = 30 * 60 * 1000;
const AI_CARD_MS = 30 * 60 * 1000;
const AI_FILES = ['lib/pixels.js', 'content/dom.js', 'content/selector.js', 'content/diagnose.js', 'content/ai-page.js'];
const AI_GUIDE = 'https://github.com/leofritsch/web-potions#ai-mode';
const AI_PICTURE = 'https://raw.githubusercontent.com/leofritsch/web-potions/main/extension/help/where-switches.png';
const AI_NEEDS_SCRIPTS = ['try', 'stop', 'save', 'switch'];

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};
const aiModeOn = async () => (await chrome.storage.local.get(AI_MODE))[AI_MODE] === true;

// --- which tabs are unlocked ------------------------------------------------------

// Stored per tab in session storage: survives the service worker sleeping, not a restart.
const aiKey = (tabId) => `ai:${tabId}`;
const cardKey = (tabId) => `ai-card:${tabId}`;
const lockKey = (origin) => `ai-lock:${origin}`;
const askKey = (host) => `ai-ask:${host}`;
const deniedKey = (host) => `ai-denied:${host}`;
const aiWrite = (tabId, session) => chrome.storage.session.set({ [aiKey(tabId)]: session });

async function aiSession(tabId, url) {
  const key = aiKey(tabId);
  const session = (await chrome.storage.session.get(key))[key];
  if (!session) return null;
  if (Date.now() > session.until || originOf(url) !== session.origin) {
    await aiEnd(tabId);
    return null;
  }
  return session;
}

// "Lock it out" holds for the whole site, in every tab, so a fooled AI can't press the keys
// again or open a new tab to get back in. Flipping AI mode off and on clears it.
const aiLocked = async (origin) => (await chrome.storage.session.get(lockKey(origin)))[lockKey(origin)] === true;

async function aiSessions() {
  const stored = await chrome.storage.session.get(null);
  return Object.keys(stored)
    .filter((key) => key.startsWith('ai:'))
    .map((key) => ({ tabId: Number(key.slice(3)), session: stored[key] }));
}

// --- which sites the user has approved ------------------------------------------------

async function aiSiteAllowed(url) {
  const { [AI_SITES]: sites = [], [AI_ASK_POPULAR]: askOnPopular } = await chrome.storage.local.get([AI_SITES, AI_ASK_POPULAR]);
  return sites.includes(WP.match.bareHost(url)) || (!askOnPopular && WP.match.test(WP.popularSites, url));
}

// Whether an AI can act on this tab right now.
const aiLive = async (session, url) => !(await aiLocked(session.origin)) && (await aiModeOn()) && (await aiSiteAllowed(url));

// Opens the Allow window. Only a real key press or the user flipping AI mode gets here, never
// a page message, so a site can't spam windows. A "no" holds for a minute at least.
async function aiAsk(host) {
  const session = chrome.storage.session;
  const denied = (await session.get(deniedKey(host)))[deniedKey(host)];
  if (denied && Date.now() - denied < AI_DENIED_MS) return;
  const open = (await session.get(askKey(host)))[askKey(host)];
  if (open != null && (await chrome.windows.update(open, { focused: true }).catch(() => null))) return;
  const win = await chrome.windows.create({ url: chrome.runtime.getURL(`allow/allow.html?site=${encodeURIComponent(host)}`), type: 'popup', width: 460, height: 380, focused: true });
  await session.remove(deniedKey(host));
  await session.set({ [askKey(host)]: win.id });
}

async function aiNotAllowedYet(host) {
  const denied = (await chrome.storage.session.get(deniedKey(host)))[deniedKey(host)];
  if (denied) return { ok: false, denied: true, error: `The user said no to ${host}. Don't ask again unless they tell you to.` };
  return {
    ok: false,
    waitingForUser: true,
    site: host,
    tellUser: `A Web Potions window is asking whether I can work on ${host}. Click Allow in it and tell me when you have. If you can't find it, it may be behind this window, or tell me and I'll bring it back.`,
  };
}

const fromAllowWindow = (sender) => !!sender.url?.startsWith(chrome.runtime.getURL('allow/allow.html'));

async function aiEnd(tabId) {
  await chrome.storage.session.remove(aiKey(tabId));
  await aiBadgeOff(tabId);
}

// --- reaching into the page ---------------------------------------------------------

async function aiPage(tabId, fn, ...args) {
  const target = { tabId, frameIds: [0] };
  const [loaded] = await chrome.scripting.executeScript({ target, func: () => !!self.WPUI?.ai, injectImmediately: true });
  if (!loaded?.result) await chrome.scripting.executeScript({ target, files: AI_FILES, injectImmediately: true });
  const [res] = await chrome.scripting.executeScript({ target, func: (f, a) => self.WPUI.ai[f](...a), args: [fn, args], injectImmediately: true });
  return res?.result;
}

const aiHelper = (tabId) =>
  chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'MAIN', files: ['content/ai-helper.js'], injectImmediately: true });

// "Operated by AI" on the page, for as long as an AI can act on this tab.
const aiBadge = (tabId, session) => aiPage(tabId, 'badge', session.until).catch(() => {});
const aiBadgeOff = (tabId) =>
  chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => self.WPUI?.ai?.badge(0), injectImmediately: true }).catch(() => {});

// A card the user should see even if the AI reloads the page right away.
async function aiCard(tabId, url, card) {
  if (card.keep) await chrome.storage.session.set({ [cardKey(tabId)]: { card, origin: originOf(url), until: Date.now() + AI_CARD_MS } });
  await aiPage(tabId, 'card', card).catch(() => {});
}

// --- the limits -----------------------------------------------------------------------

function aiMayChange(potion, url) {
  if (potion.sites?.length) return potion.sites.every((s) => WP.match.within(s, url));
  return potion.ai === WP.match.bareHost(url);
}

// Applies the limits to a potion that came from the page. Throws what the AI should fix.
function aiClean(raw, url, base) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Send a potion: { name, sites, ingredients, css, js }.');
  const merged = { ...base, ...raw, ai: base?.ai || WP.match.bareHost(url), id: base?.id || newPotionId(), enabled: raw.enabled !== false };
  if (!('sites' in merged)) merged.sites = [WP.match.suggest(url).site];
  if (typeof merged.sites === 'string') merged.sites = [merged.sites];
  merged.name ||= `${WP.match.siteName(url)} potion`;
  const potion = WP.share.normalize(merged);

  if (Array.isArray(merged.ingredients) && potion.ingredients.length !== merged.ingredients.length)
    throw new Error('One of the ingredients is invalid. Types: zap {selector}, style {selector, css}, glow {words, color}, unscroll, veil {mode}.');
  const elsewhere = potion.sites.filter((s) => !WP.match.within(s, url));
  if (elsewhere.length)
    throw new Error(
      `Not saved: ${elsewhere.join(', ')} reaches beyond this site. A potion can only cover the site you're on, so go to each site and save it there. Every-site potions ("*") have to be set up by the user.`,
    );
  if (potion.ingredients.some((i) => i.frame)) throw new Error('Rules for iframes have to be added by the user, in the brewing window.');
  if (!potion.sites.length && potion.js.trim()) throw new Error('A potion with JavaScript needs a site. Drink-only potions can only use CSS and ingredients when an AI saves them.');
  if (!potion.ingredients.length && !potion.css.trim() && !potion.js.trim()) throw new Error('This potion does nothing yet. Give it ingredients, css or js.');
  return potion;
}

const newPotionId = () => 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

function aiView(potion, url, running) {
  const changeable = aiMayChange(potion, url);
  const state = running[potion.id];
  return {
    id: potion.id,
    name: potion.name,
    sites: potion.sites,
    enabled: potion.enabled,
    madeByAI: !!potion.ai,
    canChange: changeable,
    running: state ? { runs: state.runs, error: state.error } : null,
  };
}

// `replaces` names a potion the new one takes over from. The AI can stop it in this tab, but
// only the user can turn it off for good: see the card. A script that already ran can't be
// taken back, so the AI hears when a test might not be clean.
const aiReplacedWarning = (old) =>
  old?.js?.trim()
    ? { warning: `“${old.name}” has a script that may already have run on this page, so it can still affect your test. For a sure check, reload after the user turns it off.` }
    : {};

async function aiReplaced(raw, url) {
  if (!raw?.replaces) return null;
  const old = await WP.store.get(String(raw.replaces));
  if (!old || !WP.match.test(old.sites, url)) throw new Error('`replaces` has to name a potion that runs on this site.');
  return old;
}

const whereTo = (name, host) =>
  `To turn “${name}” off or on: click the purple potion in your Chrome toolbar (if you don't see it, click the puzzle piece first), then use the switch next to its name. On ${host}, the switch is right at the top. All your potions are under Browse in the same menu.`;

// --- commands ---------------------------------------------------------------------------

const AI_COMMANDS = {
  async hello({ tabId, url, session }) {
    const host = WP.match.bareHost(url);
    const on = userScriptsOn();
    const running = on ? await runningOnTab(tabId).catch(() => ({})) : {};
    const here = (await WP.store.all()).filter((p) => WP.match.test(p.sites, url) || p.ai === host);
    return {
      ok: true,
      site: host,
      version: chrome.runtime.getManifest().version,
      minutesLeft: Math.ceil((session.until - Date.now()) / 60000),
      allowUserScripts: on,
      potions: here.map((p) => aiView(p, url, running)),
    };
  },

  // A potion's contents, if it's this site's to change.
  async read({ url, args: [id] }) {
    const potion = id ? await WP.store.get(String(id)) : null;
    if (!potion || !(WP.match.test(potion.sites, url) || potion.ai === WP.match.bareHost(url))) throw new Error('No potion with that id on this site.');
    if (!aiMayChange(potion, url)) throw new Error(`“${potion.name}” also runs on other sites, so its contents stay private. Use replaces to take over from it.`);
    const { name, description, sites, enabled, ingredients, css, js, repeat, delay, world } = potion;
    return { ok: true, id: potion.id, name, description, sites, enabled, ingredients, css, js, repeat, delay, world };
  },

  async look({ tabId, args: [options] }) {
    const facts = await aiPage(tabId, 'look', options && typeof options === 'object' ? options : {});
    const running = userScriptsOn() ? await runningOnTab(tabId).catch(() => ({})) : {};
    return { ok: true, ...facts, ...(Object.keys(running).length && { running }) };
  },

  point: async ({ tabId, args }) => ({ ok: true, ...(await aiPage(tabId, 'point', ...args)) }),

  // Runs now, and again after every reload of this tab, until saved or stopped.
  async try({ tabId, url, args: [raw], session }) {
    const stored = raw?.id ? await WP.store.get(raw.id) : null;
    if (stored && !aiMayChange(stored, url)) throw new Error(`“${stored.name}” also runs on other sites, so only the user can change it.`);
    const old = await aiReplaced(raw, url);
    const potion = aiClean(raw, url, stored || session.trials[raw?.id]);
    session.trials[potion.id] = potion;
    if (old) session.quiet = [...new Set([...(session.quiet || []), old.id])];
    await aiWrite(tabId, session);
    await stopOnTab(tabId, potion.id);
    if (old) await stopOnTab(tabId, old.id);
    const result = await testRun(tabId, potion);
    const selectors = potion.ingredients.map((i) => i.selector).filter(Boolean);
    return { ...result, id: potion.id, matched: await aiPage(tabId, 'count', selectors, potion.css), trial: true, ...aiReplacedWarning(old) };
  },

  async stop({ tabId, args: [id], session }) {
    const ids = id ? [String(id)] : Object.keys(session.trials);
    for (const one of ids) {
      delete session.trials[one];
      await restore(tabId, one);
    }
    await aiWrite(tabId, session);
    return { ok: true, stopped: ids };
  },

  // Saves and activates it. No human click: the card on the page offers Undo instead.
  async save({ tabId, url, args: [raw], session }) {
    const stored = raw?.id ? await WP.store.get(raw.id) : null;
    if (stored && !aiMayChange(stored, url)) throw new Error(`“${stored.name}” also runs on other sites, so only the user can change it.`);
    const old = await aiReplaced(raw, url);
    const potion = await WP.store.save(aiClean(raw, url, stored || session.trials[raw?.id]));
    delete session.trials[potion.id];
    if (old) session.quiet = [...new Set([...(session.quiet || []), old.id])];
    await aiWrite(tabId, session);
    await requestSync();
    await restore(tabId, potion.id);
    if (old) await stopOnTab(tabId, old.id);
    const host = WP.match.bareHost(url);
    const stillOn = old?.enabled ? { id: old.id, name: old.name } : null;
    await aiCard(tabId, url, { kind: 'saved', keep: true, name: potion.name, id: potion.id, host, drinkOnly: !potion.sites.length, undo: { id: potion.id, prev: stored }, replaces: stillOn });
    return {
      ok: true,
      id: potion.id,
      name: potion.name,
      sites: potion.sites,
      enabled: potion.enabled,
      ...(stillOn && { replaces: stillOn, ...aiReplacedWarning(old) }),
      tellUser: `Saved “${potion.name}”. ${potion.sites.length ? `It runs by itself on ${host}.` : 'Drink it from the toolbar when you want it.'} ${stillOn ? `It replaces “${old.name}”, which is still on: click Turn off on the card on this page, or use its switch. ` : ''}${whereTo(potion.name, host)}`,
      picture: AI_PICTURE,
      guide: AI_GUIDE,
    };
  },

  async switch({ tabId, url, args: [id, on] }) {
    const potion = id ? await WP.store.get(id) : null;
    if (!potion) throw new Error('No potion with that id on this site.');
    if (!aiMayChange(potion, url)) throw new Error(`“${potion.name}” also runs on other sites, so only the user can switch it.`);
    await toggle(id, !!on);
    const host = WP.match.bareHost(url);
    await aiCard(tabId, url, { kind: 'switched', keep: true, name: potion.name, id, on: !!on, host, undo: { id, prev: potion } });
    return { ok: true, id, enabled: !!on, tellUser: `“${potion.name}” is now ${on ? 'on' : 'off'}. ${whereTo(potion.name, host)}`, picture: AI_PICTURE, guide: AI_GUIDE };
  },

  async done({ tabId, session }) {
    await aiLockUp(tabId, session);
    await aiEnd(tabId);
    return { ok: true };
  },
};

async function aiLockUp(tabId, session) {
  for (const id of [...Object.keys(session.trials), ...(session.quiet || [])]) await restore(tabId, id);
}

// --- messages from the page -----------------------------------------------------------

const SILENT = { silent: true };

async function aiCall({ cmd, args, sender }) {
  const tabId = sender.tab?.id;
  if (tabId == null || sender.frameId !== 0 || !sender.url) return SILENT;
  const session = await aiSession(tabId, sender.url);
  if (!session) return SILENT;

  if (!(await aiModeOn()))
    return {
      ok: false,
      aiMode: false,
      error: 'AI mode is off.',
      tellUser:
        "AI mode is off in Web Potions. To let me test and save potions, click the purple potion in your Chrome toolbar (if you don't see it, click the puzzle piece first), click the gear, and switch on AI mode. There's also a button for it on this page.",
      picture: AI_PICTURE,
      guide: AI_GUIDE,
    };
  if (await aiLocked(session.origin))
    return { ok: false, locked: true, error: 'The user locked this site. Pressing the keys will not help. If they want you back, they can turn AI mode off and on.' };
  if (!(await aiSiteAllowed(sender.url))) return aiNotAllowedYet(WP.match.bareHost(sender.url));

  const command = Object.hasOwn(AI_COMMANDS, cmd) ? AI_COMMANDS[cmd] : null;
  if (!command) return { ok: false, error: `Unknown command: ${cmd}` };
  if (AI_NEEDS_SCRIPTS.includes(cmd) && !userScriptsOn())
    return {
      ok: false,
      allowUserScripts: false,
      error: 'Allow User Scripts is off, so potions cannot run.',
      tellUser: 'Web Potions needs one more switch: open chrome://extensions, click Details on Web Potions, and turn on Allow User Scripts.',
    };
  try {
    const url = await tabUrl(tabId);
    return await command({ tabId, url, session, args: Array.isArray(args) ? args : [] });
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Tells the user an AI is now at work here, once per unlock.
async function aiAnnounce(tabId, url, session) {
  await aiWrite(tabId, { ...session, announced: true });
  await aiBadge(tabId, session);
  await aiCard(tabId, url, { kind: 'unlocked', host: WP.match.bareHost(url) });
}

Object.assign(handlers, {
  'ai-call': aiCall,

  // Sent only for a real key press. Recorded even with AI mode off, so the AI can be told
  // why nothing works. A page that never got the key press still gets silence.
  async 'ai-unlock'({ sender }) {
    const tab = sender.tab;
    if (!tab?.id || !/^https?:/i.test(tab.url || '')) return { ok: false };
    const on = await aiModeOn();
    const previous = await aiSession(tab.id, tab.url);
    const session = { origin: originOf(tab.url), until: Date.now() + AI_UNLOCK_MS, trials: previous?.trials || {} };
    await aiWrite(tab.id, session);
    await aiHelper(tab.id).catch(() => {});
    if (await aiLocked(session.origin)) return { ok: true }; // the AI hears why from its next call
    await aiPage(tab.id, 'watch').catch(() => {});
    const host = WP.match.bareHost(tab.url);
    if (!on) await aiCard(tab.id, tab.url, { kind: 'off' });
    else if (!(await aiSiteAllowed(tab.url))) await aiAsk(host);
    else await aiAnnounce(tab.id, tab.url, session);
    return { ok: true };
  },

  // Only the Allow window can answer, and neither pages nor AIs can reach an extension page.
  async 'ai-allow'({ site, sender }) {
    if (!fromAllowWindow(sender)) return { ok: false };
    const { [AI_SITES]: sites = [] } = await chrome.storage.local.get(AI_SITES);
    await chrome.storage.session.remove([askKey(site), deniedKey(site)]);
    await chrome.storage.local.set({ [AI_SITES]: [...new Set([...sites, site])] });
    return { ok: true };
  },
  async 'ai-deny'({ site, sender }) {
    if (!fromAllowWindow(sender)) return { ok: false };
    await chrome.storage.session.remove(askKey(site));
    await chrome.storage.session.set({ [deniedKey(site)]: Date.now() });
    return { ok: true };
  },

  // The rest come from buttons on the card, in a shadow root the page can't reach.
  async 'ai-undo'({ tabId, undo }) {
    if (undo.prev) await WP.store.save(undo.prev);
    else await WP.store.remove(undo.id);
    await chrome.storage.session.remove(cardKey(tabId));
    await requestSync();
    await restore(tabId, undo.id);
    return { ok: true };
  },
  // Only ever turns a potion off, so a mistaken click is one switch away from undone.
  'ai-replace': ({ id }) => toggle(String(id), false),
  'ai-card-closed': async ({ tabId }) => {
    await chrome.storage.session.remove(cardKey(tabId));
    return { ok: true };
  },
  async 'ai-lock'({ sender }) {
    const origin = originOf(sender.tab?.url);
    await chrome.storage.session.set({ [lockKey(origin)]: true });
    for (const { tabId, session } of await aiSessions()) {
      if (session.origin !== origin) continue;
      await aiLockUp(tabId, session);
      await aiWrite(tabId, { ...session, trials: {}, quiet: [] });
      await aiBadgeOff(tabId);
    }
    return { ok: true };
  },
  async 'ai-open'({ what, q }) {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    await chrome.tabs.create({ url: chrome.runtime.getURL(`options/options.html${query}#${what === 'browse' ? 'browse' : 'settings'}`) });
    return { ok: true };
  },
});

// --- following the tab -------------------------------------------------------------------

// Every new document in an unlocked tab gets the helper and any trials back. Leaving the
// site ends the unlock (aiSession checks the origin).
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const session = await aiSession(tabId, url);
  if (!session || (await aiLocked(session.origin))) return;
  if ((await aiLive(session, url)) && userScriptsOn()) {
    for (const potion of Object.values(session.trials)) await run(tabId, potion, { mode: 'preview', customJs: true }).catch(() => {});
    for (const id of session.quiet || []) await stopOnTab(tabId, id);
  }
  await aiHelper(tabId).catch(() => {});
  await aiPage(tabId, 'watch').catch(() => {});
});

chrome.webNavigation.onDOMContentLoaded.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const session = await aiSession(tabId, url);
  if (session && (await aiLive(session, url))) await aiBadge(tabId, session);
  const key = cardKey(tabId);
  const kept = (await chrome.storage.session.get(key))[key];
  if (kept && Date.now() < kept.until && kept.origin === originOf(url)) await aiPage(tabId, 'card', kept.card).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove([aiKey(tabId), cardKey(tabId)]));

// Changes in Settings or the Allow window take effect right away, in tabs an AI already pressed
// the keys in. The AI's next call simply works, without pressing them again.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(changes[AI_MODE] || changes[AI_SITES] || changes[AI_ASK_POPULAR])) return;
  if (changes[AI_MODE]) {
    refreshMenus();
    const stored = await chrome.storage.session.get(null);
    await chrome.storage.session.remove(Object.keys(stored).filter((key) => key.startsWith('ai-lock:')));
  }
  for (const { tabId } of await aiSessions()) {
    const url = await tabUrl(tabId);
    const session = await aiSession(tabId, url);
    if (!session) continue;
    if (await aiLive(session, url)) {
      if (!session.announced) await aiAnnounce(tabId, url, session);
    } else {
      await aiWrite(tabId, { ...session, announced: false });
      await aiBadgeOff(tabId);
      if (changes[AI_MODE]?.newValue === true && !(await aiLocked(session.origin))) await aiAsk(WP.match.bareHost(url));
    }
  }
});
