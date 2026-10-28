<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="A pixelated purple potion">
</p>

<h1 align="center">Web Potions</h1>

<p align="center">
  <b>Brew the web you want.</b><br>
  Remove what bugs you, restyle what's ugly, highlight what matters,<br>
  and walk straight through “log in to keep reading”.
</p>

<p align="center">
  <img src="docs/spotted.jpg" width="820" alt="The brewing window open on a page with a login wall. Under “Spotted on this page” it lists a login wall, a stuck cookie banner, blurred content and locked scrolling, each with a Fix button.">
</p>

You look at websites all day, and whatever they show you goes straight into your
head. Web Potions is a Chrome extension that lets you decide what gets through.

Every tweak is a **potion**: a small bundle of changes that runs by itself on the
sites you choose. Brew one by pointing and clicking, or pour in your own CSS and
JavaScript. One extension instead of a drawer full of half-working ones.

## Install

Web Potions isn't on the Chrome Web Store. Loading it yourself takes a minute:

1. Download this repo (**Code → Download ZIP**, then unzip it) or `git clone` it.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Click **Details** on Web Potions and switch on **Allow User Scripts**.
   Chrome asks for this before any extension can run your own scripts on pages.
5. Pin the purple potion to your toolbar.

Works in Chrome 135 and newer.

## Brew your first potion

1. On any page, click the potion in your toolbar, then **Create new potion**.
2. If the page has a login wall, an overlay, a stuck banner, blurred text or locked
   scrolling, it's already listed under **Spotted on this page**. Click **Fix**, or
   **Fix all**, and watch it go.
3. Add more ingredients from the grid, check **Works on**, and **Save potion**.

Next time you visit, the potion runs on its own, before the page has finished loading.

<p align="center">
  <img src="docs/fixed.jpg" width="820" alt="The same page after Fix all: the login wall, the blur and the cookie banner are gone, the page scrolls, and the word AI glows green.">
</p>

## Shortcuts

| Do this | To |
| --- | --- |
| Right-click anything → **Web Potions → Remove or edit this element** | Remove, blur or restyle that exact thing |
| Select text → right-click → **Web Potions → Highlight “…” on this site** | Make those words glow. Do it again to change the color |
| Right-click → **Web Potions → Drink a potion** | Run any potion once on this page |
| <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> | Start picking elements |

While picking, hover to aim and click to open the menu. <kbd>↑</kbd> selects the
parent, <kbd>↓</kbd> goes back down, <kbd>Esc</kbd> stops. It works inside iframes
too.

## Ingredients

| Ingredient | What it does |
| --- | --- |
| **Pick & zap** | Remove, blur or restyle any element. Stored as CSS, so it sticks when the page re-renders |
| **Keyword glow** | Highlights words wherever they appear, iframes included |
| **Wall breaker** | Hides login walls and overlays, unlocks scrolling, removes blur, and keeps watching for them to come back |
| **Unlock scroll** | Only gives you your scrollbar back |
| **Image veil** | Blurs or blanks images until you hover them |
| **Custom CSS** | Your own stylesheet |
| **Custom JS** | Your own script, on a loop or once, right away or after a delay |

## The toolbar popup

<img src="docs/popup.jpg" width="250" align="right" alt="The toolbar popup: the current site, a Spotted here hint, the Active list with switches, a Create new potion button and a searchable shelf of potions.">

**Active:** lists the potions that run on this site, each with a switch. The
bubbling ones are live right now.

**Search** finds any potion on your shelf so you can **Drink** it here, even when
its sites don't match. Sites only decide where a potion runs by itself.

Below that is your whole shelf, newest first.

The gear opens settings: export everything, import potions, change the shortcut.

<br clear="right">

## Sites

| Pattern | Matches |
| --- | --- |
| `*.reddit.com/*` | reddit.com and every subdomain |
| `reddit.com/r/*` | one section of a site |
| `news.ycombinator.com/item*` | pages that start with that |
| `https://example.com/exact/page` | that page only |
| `*` | everywhere |

## Custom JavaScript

Your script runs as an async function with a `potion` helper:

```js
const sidebar = await potion.waitFor('.sidebar'); // waits until it shows up
sidebar.remove();

potion.css('body { font-family: Georgia, serif }'); // taken out when the potion stops
potion.every(5000, () => console.log('still here', potion.runs));
potion.onStop(() => console.log('bye'));
```

**Repeat every** runs it again on a loop (0 runs it once). **First run after** waits
before the first run (0 runs it as soon as the page is ready). Scripts run in their
own isolated world. Tick **Run in the page's own context** to reach the page's own
variables, like the DevTools console does.

## Sharing

**Share** in the brewing window copies a potion as JSON or downloads it as a
`.potion.json` file. In settings you can export your whole shelf, and import a file
or pasted JSON. You see what's inside before anything is added.

> **Heads up:** a potion can carry JavaScript that runs on every site it matches.
> Only import potions from people you trust.

## Privacy

No servers, no analytics, no accounts. Your potions live in Chrome's local storage
for this extension and stay there unless you export them. The only file Web Potions
ever fetches is its own pixel font, from inside the extension.

## How it works

- `extension/background.js` registers each enabled potion with Chrome's
  [`userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
  API at `document_start`, so walls don't get a chance to flash.
- `extension/lib/brew.js` turns a potion into page code. CSS goes in as constructed
  stylesheets, Keyword glow uses the CSS Highlight API (no changes to the page), and
  Wall breaker keeps an eye out for walls that come back.
- `extension/content/` is the in-page UI (brewing window, picker, menus). It's injected
  only when you open it, inside a closed shadow root the page can't reach.
- `extension/popup/` and `extension/options/` are the toolbar popup and settings.

Plain HTML, CSS and JavaScript. No build step, no dependencies.

## Development

```sh
python3 -m http.server 8765   # from the repo root
```

- <http://127.0.0.1:8765/dev/site.html> is a fake site with a login wall and the full
  in-page UI, with `chrome.*` mocked. Drive it from the console: `wpUI('new')`,
  `wpUI('pick')`.
- <http://127.0.0.1:8765/dev/popup.html> is the popup with a sample shelf (add
  `?setup=1` or `?empty=1` for those states).
- `node scripts/make-icons.mjs` redraws the icons from the ASCII sprites in
  `extension/lib/pixels.js`.

After changing extension code, click ↻ on Web Potions in `chrome://extensions` and
reload the tab.

## License

[MIT](LICENSE). The bundled [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans)
font is under the SIL Open Font License ([`extension/fonts/OFL.txt`](extension/fonts/OFL.txt)).

<p align="center"><sub>Best viewed in your own way.</sub></p>
