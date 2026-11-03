import test from 'node:test';
import assert from 'node:assert/strict';
import {ask, model} from '../extension/model.mjs';

const signal = new AbortController().signal;
const history = [{role:'user',content:'Q?', url:'excluded'}, {role:'assistant',content:'A'}, {role:'user',content:'Why?'}];
test('fixed destination, exact payload, no credentials/referrer and explicit language policy', async () => {
  const result = await ask(history, signal, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    const body = JSON.parse(options.body);
    assert.equal(body.model,model);
    assert.match(body.messages[0].content,/same language as the latest question/);
    assert.deepEqual(body.messages.slice(1),history.map(({role,content}) => ({role,content})));
    return Response.json({message:{content:'  Ответ  '}});
  });
  assert.equal(result,'Ответ');
});
test('initial answer has a separate Russian-only instruction', async () => {
  await ask(history.slice(0,1),signal,async (_url, options) => {
    assert.match(JSON.parse(options.body).messages[0].content,/только по-русски/);
    return Response.json({message:{content:'Ответ'}});
  });
});
for (const [status, message] of [[403,/OLLAMA_ORIGINS/],[404,/ollama pull/],[429,/занята/],[503,/занята/],[500,/500/]]) {
  test('HTTP ' + status, () => assert.rejects(ask(history,signal,async () => new Response(null,{status})),message));
}
test('empty, malformed, and unexpected response', async () => {
  for (const response of [Response.json({message:{content:'  '}}),new Response('html'),Response.json({})]) {
    await assert.rejects(ask(history,signal,async () => response),/пустой или нечитаемый/);
  }
});
test('network and timeout', async () => {
  const offline = async () => { throw Error('offline'); };
  await assert.rejects(ask(history,signal,offline),/Нет связи/);
  await assert.rejects(ask(history,AbortSignal.abort(),offline),/Время ожидания/);
});
test('oversize history rejected before fetch, never silently dropped', async () => {
  let sent = false;
  await assert.rejects(ask([{role:'user',content:'й'.repeat(4000)}],signal,async () => {sent=true;}), /предел контекста/);
  assert.equal(sent,false);
});
