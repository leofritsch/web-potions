// The window that asks before an AI works on a new site. It's a separate extension page
// because an AI can click anything on a web page, so a prompt there could be approved by
// the same AI it's meant to check.
const site = new URLSearchParams(location.search).get('site') || '';
const $ = (id) => document.getElementById(id);

$('logo').append(WP.pixels.svg('potion', 1.25));
$('title').textContent = `Let an AI work on ${site}?`;
$('allow').textContent = `Allow on ${site}`;

// Chrome's window frame eats part of the height, by an amount that varies, so the window
// grows until everything fits.
async function fit() {
  const missing = document.documentElement.scrollHeight - innerHeight;
  if (missing <= 0 || !chrome.windows) return;
  const win = await chrome.windows.getCurrent();
  await chrome.windows.update(win.id, { height: win.height + missing });
}
document.fonts.ready.then(fit);

const answer = async (type) => {
  await chrome.runtime.sendMessage({ type, site });
  window.close();
};
$('allow').addEventListener('click', () => answer('ai-allow'));
$('deny').addEventListener('click', () => answer('ai-deny'));
