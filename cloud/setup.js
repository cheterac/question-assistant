const key = document.querySelector('#key');
const status = document.querySelector('#status');
chrome.storage.session.get('key').then(data => { status.textContent = data.key ? 'Ключ уже сохранён для этого сеанса.' : 'Ключ ещё не задан.'; });
document.querySelector('#save').onclick = async () => {
  if (!key.value.trim()) {status.textContent = 'Введите ключ.'; return;}
  await chrome.storage.session.set({key:key.value.trim()});
  key.value = '';
  status.textContent = 'Ключ сохранён для этого сеанса.';
};
document.querySelector('#remove').onclick = async () => {
  await chrome.storage.session.remove('key'); key.value = ''; status.textContent = 'Ключ удалён.';
};
