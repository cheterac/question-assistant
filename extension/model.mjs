export const model = 'qwen3:4b-instruct-2507-q4_K_M';
const firstTurn = 'Ответь на выделенный вопрос одним коротким предложением. Пиши только по-русски. Если даны варианты, назови букву и кратко обоснуй выбор. Если информации мало, скажи об этом.';
const followUp = 'Answer ONLY the latest user message in the same language as the latest question. Give one short sentence.';

export async function ask(messages, signal, request = fetch) {
  const system = messages.length === 1 ? firstTurn : followUp;
  // Conservative UTF-8 byte budget leaves room in the 8K context for formatting and output.
  const bytes = new TextEncoder().encode([system, ...messages.map(m => m.content)].join('\n')).length;
  if (bytes + 32 * messages.length > 7200) {
    throw new Error('Достигнут предел контекста. Сократите вопрос или начните новый чат с меньшим выделением.');
  }
  let response;
  try {
    response = await request('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal,
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      body: JSON.stringify({model, stream: false, options: {num_ctx: 8192, num_predict: 224, temperature: 0},
        messages: [{role: 'system', content: system}, ...messages.map(({role, content}) => ({role, content}))]})
    });
  } catch {
    if (signal.aborted) throw new Error('Время ожидания истекло. Повторите запрос после загрузки модели.');
    throw new Error('Нет связи с Ollama. Проверьте запуск сервера, доступ браузера к локальной сети и OLLAMA_ORIGINS в настройках.');
  }
  if (response.status === 403) throw new Error('Ollama отклонила доступ. Добавьте адрес расширения в OLLAMA_ORIGINS и перезапустите сервер.');
  if (response.status === 404) throw new Error('Модель не найдена. Выполните ollama pull ' + model);
  if (response.status === 429 || response.status === 503) throw new Error('Ollama занята. Чуть позже повторите запрос.');
  if (!response.ok) throw new Error('Ошибка Ollama (HTTP ' + response.status + '). Проверьте сервер и доступную память.');
  const data = await response.json().catch(() => null);
  if (signal.aborted) throw new Error('Время ожидания истекло. Повторите запрос после загрузки модели.');
  if (typeof data?.message?.content !== 'string' || !data.message.content.trim()) throw new Error('Ollama вернула пустой или нечитаемый ответ.');
  return data.message.content.trim();
}
