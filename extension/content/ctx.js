// Remembers what was right-clicked so "Remove or edit this element" knows its target.
if (!self.__wpCtx) {
  self.__wpCtx = {};
  addEventListener(
    'contextmenu',
    (e) => {
      self.__wpCtx = { el: e.target, x: e.clientX, y: e.clientY };
    },
    true,
  );
}
