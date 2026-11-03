(() => {
  const api = globalThis.browser ?? chrome;
  // Reinvocation starts a separate conversation, including after a failed request.
  globalThis.closeQuestionPanel?.();
  if (!/^https?:$/.test(location.protocol)) return false;
  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  let question = selection?.toString().trim() ?? '';
  const field = document.activeElement;
  const textField = field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement && ['text', 'search', 'url', 'tel'].includes(field.type));
  if (textField) {
    question = field.value.slice(field.selectionStart, field.selectionEnd).trim();
    range = null;
  } else if (field instanceof HTMLInputElement && field.type === 'password') {
    question = '';
    range = null;
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join('');
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;display:block!important;z-index:2147483647!important;box-sizing:border-box!important;color-scheme:light!important';
  const root = host.attachShadow({mode: 'closed'});
  const frame = document.createElement('iframe');
  frame.title = 'Ответ рядом — локальный чат';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'display:block;border:0;width:100%;height:100%;border-radius:14px;box-shadow:0 6px 28px #17292333;background:#fff;';
  let width = 340, height = 165;
  function position() {
    const viewport = window.visualViewport;
    const vw = viewport?.width ?? innerWidth, vh = viewport?.height ?? innerHeight;
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
    const w = Math.max(1, Math.min(width, vw - 16)), h = Math.max(1, Math.min(height, vh - 16));
    const rect = textField ? field.getBoundingClientRect() : range?.getBoundingClientRect();
    const x = rect?.left ?? vx + vw - w - 8;
    const below = (rect?.bottom ?? vy) + 8;
    const y = below + h <= vy + vh - 8 ? below : (rect?.top ?? vy + vh) - h - 8;
    for (const [key, val] of Object.entries({width: w, height: h,
      left: Math.max(vx + 8, Math.min(x, vx + vw - w - 8)),
      top: Math.max(vy + 8, Math.min(y, vy + vh - h - 8))})) {
      host.style.setProperty(key, val + 'px', 'important');
    }
  }
  let startupTimer;
  function close() {
    clearTimeout(startupTimer);
    api.runtime.onMessage.removeListener(onMessage);
    window.removeEventListener('pagehide', close);
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('scroll', position);
    host.remove();
    question = '';
    range = null;
    delete globalThis.closeQuestionPanel;
  }
  function onMessage(msg, sender, reply) {
    if (sender.id !== api.runtime.id || msg.token !== token) return;
    if (msg.op === 'init') {
      clearTimeout(startupTimer);
      reply({question});
      question = '';
    } else if (msg.op === 'size') {
      width = msg.expanded ? 425 : 340;
      height = Math.max(110, Math.min(Number(msg.height) || 165, msg.expanded ? 510 : 280));
      position();
      reply(true);
    } else if (msg.op === 'close') {
      reply(true);
      close();
    }
  }
  api.runtime.onMessage.addListener(onMessage);
  globalThis.closeQuestionPanel = close;
  window.addEventListener('pagehide', close);
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  position();
  frame.src = api.runtime.getURL('panel.html') + '#' + token;
  root.append(frame);
  document.documentElement.append(host);
  startupTimer = setTimeout(() => {
    // A site can block embedding extension frames via its content security policy.
    question = '';
    const note = document.createElement('div');
    note.style.cssText = 'padding:12px;border:1px solid #aac3b6;background:#f9fcfa;border-radius:10px;color:#183a32;font:14px/1.45 system-ui';
    note.textContent = 'Не удалось открыть окно расширения на этой странице. Проверьте разрешение для сайта.';
    const button = document.createElement('button');
    button.textContent = 'Закрыть';
    button.style.display = 'block';
    button.onclick = close;
    note.append(button);
    root.replaceChildren(note);
    height = note.offsetHeight;
    position();
  }, 8000);
  return true;
})();
