// The window that asks before an AI works on a new site. It's a separate extension page
// because an AI can click anything on a web page, so a prompt there could be approved by
// the same AI it's meant to check.
const site = new URLSearchParams(location.search).get('site') || '';
const $ = (id) => document.getElementById(id);

$('logo').append(WP.pixels.svg('potion', 1.25));
$('title').textContent = `Let an AI work on ${site}?`;
$('allow').textContent = `Allow on ${site}`;

const answer = async (type) => {
  await chrome.runtime.sendMessage({ type, site });
  window.close();
};
$('allow').addEventListener('click', () => answer('ai-allow'));
$('deny').addEventListener('click', () => answer('ai-deny'));
