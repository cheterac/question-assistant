import {ask} from './model.mjs';
const api = globalThis.browser ?? chrome;
const $ = selector => document.querySelector(selector);
let screenshot;
let expanded = false, pending = false, failed = null, controller;
const messages = [];
function resize() {
  document.body.classList.toggle('wide', expanded);
}
function render() {
  $('#card').classList.toggle('expanded', expanded);
  $('#expand').textContent = expanded ? 'Свернуть' : 'Развернуть';
  $('#expand').setAttribute('aria-expanded', String(expanded));
  $('#log').replaceChildren();
  const visible = expanded ? messages : messages.filter(m => m.role === 'assistant').slice(-1);
  for (const {role, content} of visible) {
    const p = document.createElement('p');
    p.className = role;
    if (expanded) {
      const label = document.createElement('span');
      label.className = 'who';
      label.textContent = role === 'user' ? 'Вы' : 'Ответ';
      p.append(label);
    }
    p.append(document.createTextNode(content));
    $('#log').append(p);
  }
  $('form').hidden = !expanded || !messages.some(m => m.role === 'assistant');
  $('#draft').readOnly = pending;
  $('#send').disabled = pending || !$('#draft').value.trim() || messages.at(-1)?.role !== 'assistant';
  $('#retry').hidden = pending || !failed;
  $('#copy').disabled = !messages.some(m => m.role === 'assistant');
  resize();
  $('#log').scrollTop = $('#log').scrollHeight;
}
async function answer(content) {
  if (pending) return;
  pending = true;
  failed = null;
  const turn = {role:'user', content};
  messages.push(turn);
  $('#status').textContent = 'Groq готовит ответ…';
  controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  render();
  try {
    const text = await ask(messages, screenshot, controller.signal);
    messages.push({role:'assistant', content:text});
    $('#status').textContent = '';
  } catch (err) {
    // Keep the original question visible. Failed follow-ups can be edited before retry.
    if (messages.length > 1) {
      messages.pop();
      $('#draft').value = content;
    }
    failed = content;
    $('#status').textContent = err.message;
  } finally {
    clearTimeout(timer);
    pending = false;
    render();
  }
}
$('#retry').onclick = () => {
  if (messages.at(-1)?.role === 'user') messages.pop();
  const content = $('#draft').value.trim() || failed;
  $('#draft').value = '';
  answer(content);
};
$('#expand').onclick = () => {
  expanded = !expanded;
  render();
  if (expanded && !$('form').hidden) $('#draft').focus();
};
$('#setup').onclick = () => api.runtime.openOptionsPage();
$('#close').onclick = () => { controller?.abort(); window.close(); };
window.addEventListener('pagehide', () => controller?.abort());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#close').click();
});
$('form').onsubmit = e => {
  e.preventDefault();
  if ($('#send').disabled) return;
  const text = $('#draft').value.trim();
  $('#draft').value = '';
  answer(text);
};
$('#draft').oninput = () => {
  $('#send').disabled = pending || !$('#draft').value.trim() || messages.at(-1)?.role !== 'assistant';
};
$('#draft').onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('form').requestSubmit();
  }
};
$('#copy').onclick = async () => {
  const text = messages.filter(m => m.role === 'assistant').at(-1)?.content;
  if (!text) return;
  // The iframe may not have clipboard-write permission. Copy only during a user click.
  const temp = document.createElement('textarea');
  temp.value = text;
  document.body.append(temp);
  temp.select();
  let copied;
  try { copied = document.execCommand('copy'); } catch { copied = false; } finally { temp.remove(); }
  if (!copied) {
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
  }
  $('#copy').textContent = copied ? 'Скопировано' : 'Копирование запрещено';
  resize();
  setTimeout(() => { $('#copy').textContent = 'Копировать'; resize(); }, 1800);
};
$('#expand').hidden = true;
try {
  const [tab] = await api.tabs.query({active:true,currentWindow:true});
  if (!/^https?:/.test(tab?.url ?? '')) throw Error('Откройте обычную веб-страницу и повторите.');
  screenshot = await api.tabs.captureVisibleTab(tab.windowId,{format:'jpeg', quality:85});
  const [current] = await api.tabs.query({active:true,currentWindow:true});
  if (current?.id !== tab.id || current.url !== tab.url) throw Error('Вкладка изменилась. Откройте окно снова.');
  $('#shot').src = screenshot;
  $('#preview').hidden = false;
  $('#status').textContent = 'Проверьте снимок. Весь видимый текст и изображения попадут в Groq.';
} catch (err) {
  $('#status').textContent = 'Снимок недоступен. ' + err.message;
}
$('#analyze').onclick = () => {
  $('#preview').hidden = true;
  $('#expand').hidden = false;
  answer('Ответь на вопрос со снимка. Если видны варианты, укажи верный. Если вопросов несколько, перечисли ответы по порядку.');
};
