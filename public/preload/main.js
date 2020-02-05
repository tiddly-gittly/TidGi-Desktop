const {
  ContextMenuListener,
  ContextMenuBuilder,
} = require('electron-spellchecker');

// for copy paste context menu
window.onload = () => {
  window.contextMenuBuilder = new ContextMenuBuilder(
    null,
    null,
    true,
  );
  window.contextMenuListener = new ContextMenuListener((info) => {
    window.contextMenuBuilder.showPopupMenu(info);
  });
};
