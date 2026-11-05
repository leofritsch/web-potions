// window.webPotions: what an AI calls from its browser tool's JavaScript. Only added to a
// page after a real key press unlocked the tab. See skill/web-potions/SKILL.md.
(() => {
  if (window.webPotions) return;

  const call = (cmd, ...args) =>
    new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const done = () => {
        removeEventListener('message', onReply);
        clearTimeout(timer);
      };
      const onReply = (e) => {
        if (e.source !== window || e.data?.webPotionsReply !== id) return;
        done();
        resolve(e.data.result);
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error('Web Potions did not answer. The unlock may have run out: press Ctrl+Alt+Shift+P again.'));
      }, 15000);
      addEventListener('message', onReply);
      postMessage({ webPotionsCall: id, cmd, args }, location.origin);
    });

  window.webPotions = Object.freeze({
    hello: () => call('hello'),
    look: (options) => call('look', options),
    read: (id) => call('read', id),
    point: (...where) => call('point', ...where),
    try: (potion) => call('try', potion),
    stop: (id) => call('stop', id),
    save: (potion) => call('save', potion),
    on: (id) => call('switch', id, true),
    off: (id) => call('switch', id, false),
    done: () => call('done'),
  });
})();
