// Entry point for the in-page UI. The background injects these files on demand and
// then sends { type: 'wp:ui', action } messages here.
(function () {
  const UI = self.WPUI;
  if (UI.ready) return;

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'wp:ui') return false;
    const { panel } = UI;
    const actions = {
      new: () => panel.open({ fresh: true }),
      edit: () => panel.open({ id: msg.id }),
      ensure: () => panel.ensure(),
      pick: () => panel.pick(),
      'zap-context': () => panel.zapContext(),
      glow: () => panel.glow(msg.words || []),
      add: () => panel.fromFrame(msg.ingredient, msg.frameUrl),
      'stop-pick': () => panel.stopPick(),
    };
    Promise.resolve(actions[msg.action]?.())
      .then(() => reply({ ok: true }))
      .catch((e) => reply({ error: String(e?.message || e) }));
    return true;
  });

  UI.ready = true;
})();
