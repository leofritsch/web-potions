// Shared plumbing for the in-page UI: a tiny element builder, pixel icons, the font,
// and the shadow-root host everything renders into.
(function () {
  const UI = (self.WPUI = self.WPUI || {});
  if (UI.h) return;

  UI.h = function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null) continue;
      if (v === false) {
        if (k in el) el[k] = false;
        continue;
      }
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, children);
    return el;
  };

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  UI.icon = (name, scale = 2) => WP.pixels.svg(name, scale);

  UI.send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          void chrome.runtime.lastError;
          resolve(res || { error: 'Web Potions was reloaded. Refresh this page.' });
        });
      } catch {
        resolve({ error: 'Web Potions was reloaded. Refresh this page.' });
      }
    });

  // Fonts can't be declared inside a shadow root, and the page's CSP may block
  // extension URLs, so the font is loaded from bytes into the document.
  let fontLoading = null;
  UI.loadFont = () =>
    (fontLoading ||= (async () => {
      try {
        const buf = await (await fetch(chrome.runtime.getURL('fonts/pixelify-sans.woff2'))).arrayBuffer();
        const face = new FontFace('WP Pixelify', buf, { weight: '400 700' });
        document.fonts.add(await face.load());
      } catch {
        /* falls back to Verdana */
      }
    })());

  UI.mount = function mount() {
    if (UI.host?.isConnected) return UI.layer;
    const host = document.createElement('web-potions-ui');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(UI.CSS);
    root.adoptedStyleSheets = [sheet];
    const layer = document.createElement('div');
    layer.className = 'wp';
    root.append(layer);
    document.documentElement.append(host);
    UI.host = host;
    UI.root = root;
    UI.layer = layer;
    return layer;
  };

  UI.isUI = (e) => !!UI.host && e.composedPath().includes(UI.host);

  let toastTimer = null;
  UI.toast = function toast(text, { icon = 'potion' } = {}) {
    const layer = UI.mount();
    layer.querySelector('.toast')?.remove();
    const el = UI.h('div', { class: 'toast', role: 'status' }, UI.icon(icon, 2), UI.h('span', {}, text));
    layer.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 160);
    }, 2600);
  };

  UI.clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Tab indents inside code areas instead of leaving the field.
  UI.tabKey = (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const t = e.target;
    t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new Event('input'));
  };

  // Marching ants around an element, e.g. while hovering a "Spotted" finding.
  UI.outline = (el) => {
    const box = (UI._outline ||= UI.h('div', { class: 'pick-box' }));
    if (!el?.isConnected) return box.remove();
    const r = el.getBoundingClientRect();
    box.style.cssText = `display:block;width:${Math.max(4, r.width)}px;height:${Math.max(4, r.height)}px;transform:translate(${r.left}px,${r.top}px);transition:none`;
    UI.mount().append(box);
  };

  UI.CSS = /* css */ `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.wp {
  --paper: #F7F5FF;
  --card: #FFFFFF;
  --ink: #22163A;
  --muted: #6B6285;
  --line: #DDD4F2;
  --potion: #9B30FF;
  --deep: #6A12C4;
  --lilac: #E7DAFF;
  --slime: #17853D;
  --slime-hi: #7CF29A;
  --lo: #BDB2D9;
  --danger: #C4123E;
  --pixel: 'WP Pixelify', 'Pixelify Sans', Verdana, sans-serif;
  --body: Verdana, Tahoma, Geneva, sans-serif;
  --code: ui-monospace, Menlo, Monaco, monospace;
  font: 12px/1.45 var(--body);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.wp svg { display: block; flex: none; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--potion); outline-offset: 1px; }

/* buttons: Windows 2000 bevels, ink outline */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 26px; padding: 3px 12px;
  background: var(--card); border: 1px solid var(--ink); border-radius: 0;
  box-shadow: inset -2px -2px 0 var(--lo), inset 2px 2px 0 #fff;
  cursor: pointer; white-space: nowrap;
}
.btn:hover { background: #FCFAFF; }
.btn:active { box-shadow: inset 2px 2px 0 var(--lo); padding: 4px 11px 2px 13px; }
.btn.primary { background: var(--potion); color: #fff; box-shadow: inset -2px -2px 0 var(--deep), inset 2px 2px 0 #C58BFF; font-weight: bold; }
.btn.primary:hover { background: #A23DFF; }
.btn.primary:active { box-shadow: inset 2px 2px 0 var(--deep); }
.btn.quiet { border-color: transparent; background: none; box-shadow: none; color: var(--muted); text-decoration: underline; text-underline-offset: 2px; padding: 3px 4px; }
.btn.quiet:hover { color: var(--ink); }
.btn.danger { color: var(--danger); }
.btn[disabled] { opacity: .5; cursor: default; }
.btn.sm { min-height: 22px; padding: 1px 9px; font-size: 11px; }
.btn.sm:active { padding: 2px 8px 0 10px; }

input[type=text], input[type=number], textarea {
  width: 100%; padding: 5px 7px;
  background: var(--card); color: var(--ink);
  border: 1px solid var(--ink); border-radius: 0;
  box-shadow: inset 2px 2px 0 #EEE8FA;
  font: 12px var(--body);
}
input[type=number] { width: 72px; }
textarea { font: 11.5px/1.5 var(--code); resize: vertical; min-height: 88px; tab-size: 2; white-space: pre; }
input::placeholder, textarea::placeholder { color: #A39BBB; }

/* the window */
.win {
  position: fixed; top: 16px; right: 16px; width: 384px;
  max-height: calc(100vh - 32px);
  display: flex; flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
  pointer-events: auto;
}
.win.enter { animation: win-in 150ms cubic-bezier(.2, .8, .2, 1); }
.win.leave { animation: win-out 110ms ease-in forwards; }
@keyframes win-in { from { opacity: 0; transform: translateY(-6px) scale(.985); } }
@keyframes win-out { to { opacity: 0; transform: translateY(-4px) scale(.99); } }
.titlebar {
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 4px 0 7px;
  color: #fff; user-select: none; cursor: grab;
  border-bottom: 1px solid var(--ink);
  background:
    linear-gradient(90deg, var(--potion) 45%, rgba(155, 48, 255, 0) 100%),
    repeating-conic-gradient(var(--potion) 0 25%, var(--lilac) 0 50%) 0 0 / 2px 2px;
}
.titlebar:active { cursor: grabbing; }
.titlebar .t { flex: 1; font: 15px/1 var(--pixel); letter-spacing: .2px; text-shadow: 1px 1px 0 var(--deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.titlebar .tb {
  width: 20px; height: 20px; padding: 0; display: grid; place-items: center;
  background: var(--card); color: var(--ink); border: 1px solid var(--ink);
  box-shadow: inset -2px -2px 0 var(--lo), inset 2px 2px 0 #fff;
  font: 13px/1 var(--pixel); cursor: pointer;
}
.titlebar .tb:active { box-shadow: inset 2px 2px 0 var(--lo); }
.body { overflow: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 18px; overscroll-behavior: contain; }
input.name {
  width: 100%; padding: 2px 0 3px; margin: 0;
  font: 22px/1.1 var(--pixel); color: var(--ink);
  background: none; border: 0; border-bottom: 1px dashed transparent; box-shadow: none;
}
input.name:hover { border-bottom-color: var(--lo); }
input.name:focus { outline: none; border-bottom: 1px dashed var(--potion); }
.sec { display: flex; flex-direction: column; gap: 7px; }
.sec > h3 { margin: 0; font: 14px/1 var(--pixel); display: flex; align-items: center; gap: 6px; min-height: 16px; }

/* what the page is doing to you */
.spotted { padding: 10px; margin: -2px 0; background: #FFFBE0; border: 1px solid var(--ink); box-shadow: 3px 3px 0 #F3E27A; }
.spots { display: flex; flex-direction: column; }
.spot { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 2px 0; border-top: 1px dashed #E9DC8E; }
.spot:first-child { border-top: 0; }
.spot .what { flex: none; font-weight: bold; font-size: 11.5px; }
.spot .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.spot.done .what, .spot.done .detail { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--lo); }
.spot .ok { font: 13px/1 var(--pixel); color: var(--slime); padding: 0 6px; }
.spotted .hint { margin-top: 4px; }
.tag { flex: none; padding: 0 4px; font: 10px/1.5 var(--body); color: var(--deep); background: var(--lilac); border: 1px solid var(--lo); }
.sec > h3 small { font: 11px var(--body); color: var(--muted); }

.site { display: flex; gap: 4px; }
.site input { font: 12px var(--code); }
.x {
  flex: none; width: 26px; padding: 0; display: grid; place-items: center;
  background: none; border: 1px solid transparent; color: var(--muted); cursor: pointer; font: 14px/1 var(--pixel);
}
.x:hover { color: var(--danger); border-color: var(--line); }
.hint { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
.hint .yes { color: var(--slime); }
.dot { width: 7px; height: 7px; background: var(--lo); flex: none; }
.dot.on { background: var(--slime-hi); box-shadow: 0 0 0 1px var(--slime); }
.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip {
  padding: 2px 7px; font-size: 11px; cursor: pointer;
  background: var(--card); border: 1px solid var(--line); color: var(--ink);
}
.chip:hover { border-color: var(--ink); }
.chip.on { border-color: var(--potion); background: var(--lilac); }

.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 7px;
  padding: 9px 8px 8px; min-height: 92px; text-align: left;
  background: var(--card); border: 1px solid var(--ink);
  box-shadow: inset -2px -2px 0 var(--lo), inset 2px 2px 0 #fff;
  cursor: pointer;
}
.tile:hover { background: #FCFAFF; }
.tile:active, .tile.on { box-shadow: inset 2px 2px 0 var(--lo); background: var(--lilac); }
.tile b { font: 14px/1 var(--pixel); font-weight: 500; }
.tile span { font-size: 10.5px; line-height: 1.3; color: var(--muted); }

.form { display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--card); border: 1px solid var(--ink); }
.form .row { display: flex; align-items: center; gap: 6px; }
.form .row.end { justify-content: flex-end; }
.swatch { width: 22px; height: 22px; border: 1px solid var(--ink); cursor: pointer; padding: 0; }
.swatch.on { outline: 2px solid var(--ink); outline-offset: 1px; }

.ings { display: flex; flex-direction: column; border: 1px solid var(--ink); background: var(--card); }
.ing { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 4px 4px 4px 8px; border-top: 1px solid var(--line); }
.ing:first-child { border-top: 0; }
.ing.fresh { animation: fresh 900ms ease-out; }
@keyframes fresh { from { background: var(--lilac); } }
.ing .what { flex: none; font: 13px/1 var(--pixel); }
.ing .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.ing code, .menu code { font: 11px var(--code); color: var(--deep); }
.ing .edit { cursor: pointer; }
.ing .seg { display: flex; }
.ing .seg button { padding: 1px 6px; font-size: 11px; background: var(--card); border: 1px solid var(--line); cursor: pointer; }
.ing .seg button + button { border-left: 0; }
.ing .seg button.on { background: var(--lilac); border-color: var(--potion); }
.ing .swatches { display: flex; gap: 5px; padding-right: 2px; }
.ing .swatch { width: 12px; height: 12px; }
.ing .swatch.on { outline-width: 1.5px; }
.empty { padding: 12px; color: var(--muted); font-size: 11px; text-align: center; border: 1px dashed var(--lo); }

.code { display: flex; flex-direction: column; gap: 7px; }
.code .head { display: flex; align-items: center; gap: 6px; }
.code .head b { flex: 1; font: 14px/1 var(--pixel); font-weight: 500; }
.timing { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 5px 8px; font-size: 11px; }
.timing span:nth-child(3n) { color: var(--muted); }
.check { display: flex; align-items: center; gap: 7px; font-size: 11px; cursor: pointer; user-select: none; }
.check input { appearance: none; width: 14px; height: 14px; margin: 0; flex: none; border: 1px solid var(--ink); background: var(--card); box-shadow: inset 1px 1px 0 var(--lo); cursor: pointer; display: grid; place-items: center; }
.check input:checked { background: var(--potion); box-shadow: inset 1px 1px 0 var(--deep); }
.check input:checked::after { content: ''; width: 6px; height: 6px; background: #fff; }
.result { font-size: 11px; color: var(--muted); }
.result.ok { color: var(--slime); }
.result.bad { color: var(--danger); }

.foot { display: flex; flex-direction: column; gap: 9px; padding: 10px 14px 12px; border-top: 1px solid var(--ink); background: var(--card); }
.foot .row { display: flex; align-items: center; gap: 6px; }
.foot .row .grow { flex: 1; }
.confirm { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.confirm span { flex: 1; }

/* picker */
.pick-box {
  position: fixed; top: 0; left: 0; pointer-events: none; display: none;
  background-color: rgba(155, 48, 255, .10);
  background-image:
    linear-gradient(90deg, var(--potion) 50%, #fff 50%),
    linear-gradient(90deg, var(--potion) 50%, #fff 50%),
    linear-gradient(0deg, var(--potion) 50%, #fff 50%),
    linear-gradient(0deg, var(--potion) 50%, #fff 50%);
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  background-size: 8px 2px, 8px 2px, 2px 8px, 2px 8px;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  animation: ants .6s linear infinite;
  transition: transform 70ms ease-out, width 70ms ease-out, height 70ms ease-out;
}
.pick-box.locked { background-color: rgba(155, 48, 255, .18); }
.pick-box.frame { background-color: transparent; animation: none; }
@keyframes ants { to { background-position: 8px 0, -8px 100%, 0 -8px, 100% 8px; } }
.pick-tag {
  position: absolute; left: 0; bottom: 100%; margin-bottom: 3px;
  padding: 2px 6px 3px; white-space: nowrap;
  background: var(--ink); color: #fff; font: 12px/1 var(--pixel);
}
.pick-tag.below { bottom: auto; top: 100%; margin: 3px 0 0; }
.pick-tag small { color: #C9BDF0; font: 10px var(--body); margin-left: 6px; }
.pick-bar {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 6px 6px 6px 10px; pointer-events: auto; white-space: nowrap;
  background: var(--paper); border: 1px solid var(--ink); box-shadow: 3px 3px 0 var(--ink);
}
.pick-bar .msg { font: 14px/1 var(--pixel); }
.pick-bar .keys { font-size: 11px; color: var(--muted); display: flex; gap: 8px; }
kbd {
  display: inline-block; min-width: 18px; padding: 1px 4px; text-align: center;
  font: 10px/1.4 var(--body); color: var(--ink);
  background: var(--card); border: 1px solid var(--lo); box-shadow: 0 1px 0 var(--lo);
}
.count { font: 13px/1 var(--pixel); color: var(--deep); }

/* action menu: a right-click menu, circa 2000 */
.menu {
  position: fixed; min-width: 232px; padding: 3px; pointer-events: auto;
  background: var(--card); border: 1px solid var(--ink); box-shadow: 3px 3px 0 var(--ink);
  animation: menu-in 90ms ease-out;
}
@keyframes menu-in { from { opacity: 0; } }
.menu header { padding: 5px 8px 6px; margin-bottom: 3px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 10px; }
.menu header code { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu header small { color: var(--muted); font-size: 10px; white-space: nowrap; }
.menu .item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 5px 8px; text-align: left; cursor: default;
  background: none; border: 0;
}
.menu .item svg { opacity: .9; }
.menu .item .label { flex: 1; }
.menu .item kbd { border: 0; box-shadow: none; background: none; color: var(--muted); }
.menu .item:hover, .menu .item.on { background: var(--potion); color: #fff; }
.menu .item:hover kbd, .menu .item.on kbd { color: #E9D8FF; }
.menu hr { border: 0; border-top: 1px solid var(--line); margin: 3px 0; }
.menu .styler { display: flex; flex-direction: column; gap: 7px; padding: 6px 6px 4px; width: 300px; }
.menu .styler textarea { min-height: 96px; white-space: pre-wrap; }

.toast {
  position: fixed; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 10px;
  padding: 8px 12px 8px 9px; max-width: 360px; pointer-events: none;
  background: var(--card); border: 1px solid var(--ink); box-shadow: 3px 3px 0 var(--ink);
  font-size: 12px; animation: toast-in 160ms cubic-bezier(.2, .8, .2, 1);
}
.toast.out { animation: toast-out 160ms ease-in forwards; }
@keyframes toast-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes toast-out { to { opacity: 0; transform: translateY(4px); } }

@media (prefers-reduced-motion: reduce) {
  .pick-box { animation: none; transition: none; }
  .win.enter, .win.leave, .toast, .toast.out, .menu, .ing.fresh { animation-duration: 1ms; }
}
`;
})();
