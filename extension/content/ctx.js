// Runs on every page, before the page's own scripts. Keep it tiny.
if (!self.__wpCtx) {
  self.__wpCtx = {};

  // Remembers what was right-clicked so "Remove or edit this element" knows its target.
  addEventListener(
    'contextmenu',
    (e) => {
      self.__wpCtx = { el: e.target, x: e.clientX, y: e.clientY };
    },
    true,
  );

  const toBackground = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      return Promise.resolve(null); // the extension was reloaded since this page loaded
    }
  };

  // AI mode. A real key press is the one thing a page's scripts can't fake, so it's how
  // an AI proves it isn't the website. See ai-bridge.js.
  addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted || !e.ctrlKey || !e.altKey || !e.shiftKey || e.code !== 'KeyP') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toBackground({ type: 'ai-unlock' });
    },
    true,
  );

  // Calls from window.webPotions. The background stays silent unless this tab is unlocked,
  // so a site can't use this to find out the extension is here.
  if (window.top === window)
    addEventListener('message', async (e) => {
      const id = e.source === window && e.data?.webPotionsCall;
      if (!id) return;
      const result = await toBackground({ type: 'ai-call', cmd: String(e.data.cmd), args: e.data.args });
      if (result && !result.silent) postMessage({ webPotionsReply: id, result }, location.origin);
    });
}
