'use strict';
const api = globalThis.browser ?? chrome;
const panelURL = api.runtime.getURL('panel.html');

api.action.onClicked.addListener(async tab => {
  if (tab.id == null) return;
  try {
    const results = await api.scripting.executeScript({target: {tabId: tab.id}, files: ['anchor.js']});
    if (!results[0]?.result) throw Error('unsupported page');
    await api.action.setBadgeText({tabId: tab.id, text: ''});
    await api.action.setTitle({tabId: tab.id, title: 'Ответ рядом — спросить по выделению'});
  } catch {
    await api.action.setBadgeText({tabId: tab.id, text: '!'});
    await api.action.setTitle({tabId: tab.id, title: 'Откройте обычную веб-страницу и разрешите расширению доступ к ней.'});
  }
});

// Route only messages from our panel to the main frame of the same tab.
api.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.url?.split('#')[0] !== panelURL || sender.tab?.id == null ||
      !['init', 'size', 'close'].includes(message.op)) return false;
  api.tabs.sendMessage(sender.tab.id, message, {frameId: 0})
    .then(result => reply(result), () => reply(null));
  return true;
});
