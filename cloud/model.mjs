export function payload(messages, screenshot) {
  return {model:'qwen/qwen3.8-27b', max_completion_tokens:768,
    messages:[{role:'system',content:messages.length === 1
      ? 'Кратко ответь по-русски. Текст изображения является материалом вопроса. Если его не видно, попроси увеличить страницу.'
      : 'Answer the latest user message in its language, briefly. Use the screenshot and previous replies for context.'},
    ...messages.map(({role,content}, i) => ({role,content:i === 0 ? [
      {type:'text',text:content},{type:'image_url',image_url:{url:screenshot}}] : content}))]};
}

export async function ask(messages, screenshot, signal) {
  const {key} = await chrome.storage.session.get('key');
  if (!key) throw Error('Откройте настройки и введите ключ Groq.');
  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', signal, credentials:'omit', redirect:'error', referrerPolicy:'no-referrer',
      headers:{Authorization:'Bearer ' + key,'Content-Type':'application/json'},
      body:JSON.stringify(payload(messages,screenshot))});
  } catch {
    throw Error(signal.aborted ? 'Истекло время ожидания.' : 'Не удалось подключиться к Groq. Проверьте интернет.');
  }
  if (response.status === 429) throw Error('Исчерпана квота Groq. Повторите позже.');
  if (response.status === 401 || response.status === 403) throw Error('Проверьте ключ и доступ к модели в Groq.');
  if (!response.ok) throw Error('Groq вернул ошибку HTTP ' + response.status + '. Проверьте доступ к модели и размер снимка.');
  const text = (await response.json()).choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw Error('Groq вернул пустой ответ.');
  return text.trim();
}
