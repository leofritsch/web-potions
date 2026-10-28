<p align="center">
  <img src="docs/logo.png" width="128" height="128" alt="A pixelated purple potion">
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

## Potion catalog

Ready-made potions to start with. Once Web Potions is installed, click **Browse** in
the toolbar popup and **Get** any of these. One click and it's on your shelf.

<!-- catalog:start -->
| Potion | Works on | What it does |
| --- | --- | --- |
| [Instagram, no pictures](potions/instagram-no-pictures.potion.json) | instagram.com | Every photo and video on Instagram turns invisible. Captions and comments stay. |
| [Medium unlocked](potions/medium-unlocked.potion.json) | medium.com | Lifts Medium's sign-in walls and pop-ups so you can keep reading. Member-only stories stay locked: their full text isn't on the page. |
| [Quora unlocked](potions/quora-unlocked.potion.json) | quora.com | Lifts the log-in wall and the blur, and lets the page scroll again. |
| [Reddit unlocked](potions/reddit-unlocked.potion.json) | reddit.com | Lifts “log in to keep reading” walls and lets the page scroll again. |
| [YouTube, no recommendations](potions/youtube-no-recommendations.potion.json) | youtube.com | The home feed, the Up next sidebar and end-screen suggestions disappear. Search and Subscriptions still work. |
| [YouTube, no Shorts](potions/youtube-no-shorts.potion.json) | youtube.com | Hides the Shorts tab, Shorts shelves, and Shorts in feeds and search results. |
| [Break the wall](potions/break-the-wall.potion.json) | Any page, when you drink it | Drink it on any page that says “log in to keep reading”. Lifts the wall, the blur and the scroll lock. |
| [Gray mode](potions/gray-mode.potion.json) | Any page, when you drink it | Drains the color out of any page. Less slot machine, more newspaper. |
| [Hide all images](potions/hide-all-images.potion.json) | Any page, when you drink it | Every image becomes a blank tile. Hover one to peek. |
| [Hype detector](potions/hype-detector.potion.json) | Any page, when you drink it | Lights up buzzwords, so you can see how hard a page is selling. |
| [Night mode](potions/night-mode.potion.json) | Any page, when you drink it | Turns any page dark by flipping its colors. Photos and videos stay normal. |
| [Unstick everything](potions/unstick-everything.potion.json) | Any page, when you drink it | Sticky headers, floating bars and pinned pop-ups go back to being normal parts of the page. |
<!-- catalog:end -->

Brewed a good one? Share it as a `.potion.json`, drop it in [`potions/`](potions),
run `node scripts/build-catalog.mjs` and open a pull request.

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

<img src="docs/popup.jpg" width="250" align="right" alt="The toolbar popup: the current site, a Spotted here hint, the Active list with switches, a Create new potion button, and a search box with a Browse button above the shelf of potions.">

**Active:** lists the potions that run on this site, each with a switch. The
bubbling ones are live right now.

**Search** finds any potion on your shelf so you can **Drink** it here, even when
its sites don't match. Sites only decide where a potion runs by itself.

Below that is your whole shelf, newest first.

**Browse** opens a page with all your potions and the [catalog](#potion-catalog)
of ready-made ones. The gear opens settings: export everything, import potions,
change the shortcut.

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
for this extension and stay there unless you export them. The one thing Web Potions
fetches from the internet is the catalog, a plain file from this repo, when you open
**Browse**. Nothing about you goes with it.

## How it works

- `extension/background.js` registers each enabled potion with Chrome's
  [`userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
  API at `document_start`, so walls don't get a chance to flash.
- `extension/lib/brew.js` turns a potion into page code. CSS goes in as constructed
  stylesheets, Keyword glow uses the CSS Highlight API (no changes to the page), and
  Wall breaker keeps an eye out for walls that come back.
- `extension/content/` is the in-page UI (brewing window, picker, menus). It's injected
  only when you open it, inside a closed shadow root the page can't reach.
- `extension/popup/` is the toolbar popup. `extension/options/` is the Browse and
  Settings page.
- `potions/` is the catalog. Each potion is its own file; `catalog.json` bundles them
  for the Browse page.

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
- <http://127.0.0.1:8765/dev/options.html#browse> is the Browse page, reading the
  catalog from your local `potions/` (add `?offline=1` to see it fail).
- `node scripts/build-catalog.mjs` checks every file in `potions/` and rebuilds
  `potions/catalog.json` and the catalog table in this README.
- `node scripts/make-icons.mjs` redraws the icons from the ASCII sprites in
  `extension/lib/pixels.js`.

After changing extension code, click ↻ on Web Potions in `chrome://extensions` and
reload the tab.

## License

[MIT](LICENSE). The bundled [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans)
font is under the SIL Open Font License ([`extension/fonts/OFL.txt`](extension/fonts/OFL.txt)).

<p align="center"><sub>Best viewed in your own way.</sub></p>
