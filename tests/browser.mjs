// Run only against a disposable Chrome for Testing profile. No packages required.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const live = process.argv.includes('--live');
const [port, path] = readFileSync(process.argv[2], 'utf8').trim().split('\n');
const ws = new WebSocket('ws://127.0.0.1:' + port + path);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
const pending = new Map();
const fixtureURL = 'https://question-assistant.test/private-sentinel';
let seq = 0;
ws.onmessage = ({data}) => {
  const msg = JSON.parse(data), job = pending.get(msg.id);
  if (msg.method === 'Fetch.requestPaused') {
    // Serve an HTTPS page entirely in the test browser, without contacting a website.
    const body = Buffer.from('<meta charset=utf-8><p>private-sentinel</p><b style="position:fixed;right:0;bottom:0">' + sample + '</b>').toString('base64');
    call('Fetch.fulfillRequest', {requestId:msg.params.requestId, responseCode:200,
      responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}], body}, msg.sessionId);
    return;
  }
  if (!job) return;
  pending.delete(msg.id);
  if (msg.error) job.reject(Error(msg.error.message)); else job.resolve(msg.result);
};
function call(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params, sessionId}));
  });
}
async function until(fn, attempts = 100) {
  for (let i = 0; i < attempts; i++) {
    const result = await fn();
    if (result) return result;
    await delay(80);
  }
  throw Error('Timeout: ' + fn);
}
async function evaluate(session, expression, userGesture = false) {
  const res = await call('Runtime.evaluate', {expression, userGesture, returnByValue:true, awaitPromise:true}, session);
  if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result.value;
}
const sample = live ? 'Which planet is called the Red Planet? A) Mars B) Venus' : 'Сколько будет 2 + 2? А) 3 Б) 4';
const requests = [];
let failNext = false;
const ollama = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  if (req.method === 'OPTIONS') return res.end();
  assert.equal(req.url, '/api/chat');
  assert.equal(req.headers.referer, undefined);
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push(JSON.parse(body));
  await delay(300);
  if (failNext) { failNext = false; res.writeHead(503); return res.end(); }
  res.end(JSON.stringify({message:{content:requests.length === 1 ? 'Б) 4.' : 'Two plus two is four.'}}));
});
function listen(server, port) {
  return new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
}
let targetId;
try {
  if (!live) await listen(ollama, 11434);
  const targets = async () => (await call('Target.getTargets')).targetInfos;
  const {extensions} = await call('Extensions.getExtensions');
  const id = extensions.find(e => e.name === 'Ответ рядом')?.id;
  assert.ok(id, JSON.stringify(extensions));
  const url = 'about:blank#question-assistant-test';
  ({targetId} = await call('Target.createTarget', {url, forTab: true}));
  const attach = async target => (await call('Target.attachToTarget',{targetId:target, flatten:true})).sessionId;
  const tabPage = await until(async () => (await targets()).find(t => t.type === 'page' && t.url === url));
  const top = await attach(tabPage.targetId);
  await call('Fetch.enable', {patterns:[{urlPattern:'https://question-assistant.test/*'}]}, top);
  await call('Page.navigate',{url:fixtureURL},top);
  await until(() => evaluate(top, "!!document.querySelector('b')"));
  await evaluate(top, "getSelection().selectAllChildren(document.querySelector('b'))");
  const trigger = () => call('Extensions.triggerAction',{id,targetId});
  const getPanel = async () => (await targets()).find(t => t.type === 'iframe' && t.url.includes(id + '/panel.html'));
  // Alt (1) + Shift (8), key Q, with the macOS virtual key code.
  const key = {modifiers:9, code:'KeyQ', key:'Q', windowsVirtualKeyCode:81, nativeVirtualKeyCode:12};
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown', ...key},top);
  await call('Input.dispatchKeyEvent',{type:'keyUp', ...key},top);
  const panel = await attach((await until(getPanel)).targetId);
  const value = expression => evaluate(panel, expression);
  const commands = await value('chrome.commands.getAll()');
  assert.ok(commands.some(c => c.name === '_execute_action' && c.shortcut), 'shortcut is assigned');
  async function waitAnswer() {
    const result = await until(async () => {
      const status = await value("document.querySelector('#status')?.textContent");
      if (await value("document.querySelector('#retry')?.hidden === false")) throw Error(status);
      if (status === '') return value("document.querySelector('#log p:last-child')?.lastChild?.textContent");
    }, live ? 1500 : 100);
    return result;
  }
  const first = await waitAnswer();
  if (live) {
    console.log('Первый ответ:', first);
    assert.match(first, /[а-яё]/i);
    assert.match(first, /марс|mars/i);
  } else {
    assert.equal(first,'Б) 4.');
    assert.deepEqual(requests[0].messages.slice(1), [{role:'user',content:sample}]);
  }
  const rect = await evaluate(top, "document.documentElement.lastElementChild.getBoundingClientRect().toJSON()");
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.right <= await evaluate(top,'innerWidth') && rect.bottom <= await evaluate(top,'innerHeight'));
  await value("document.querySelector('#expand').click()");
  const noOverflow = await value('document.documentElement.scrollWidth <= innerWidth');
  assert.ok(noOverflow, 'no horizontal scrolling');
  // Intercept copy in the disposable frame so the test does not overwrite the OS clipboard.
  const copied = await evaluate(panel, `(() => {
    let result = '';
    document.addEventListener('copy', e => {
      e.preventDefault();
      result = document.activeElement.value;
    }, {once:true});
    document.querySelector('#copy').click();
    return result;
  })()`, true);
  assert.equal(copied, first);
  const submit = text => value("document.querySelector('#draft').value=" + JSON.stringify(text) + ";document.querySelector('#draft').dispatchEvent(new Event('input'));document.querySelector('form').requestSubmit()");
  if (live) {
    await submit('Why is option B wrong?');
    const next = await waitAnswer();
    console.log('Продолжение:', next);
    assert.match(next, /venus/i);
    assert.doesNotMatch(next, /[а-яё]/i);
  } else {
    await submit('Explain in English.');
    await until(() => value("document.querySelector('#log').innerText.includes('Two plus two is four.')"));
    assert.deepEqual(requests[1].messages.slice(1), [{role:'user',content:sample},{role:'assistant',content:'Б) 4.'},{role:'user',content:'Explain in English.'}]);
    failNext = true;
    await submit('Again?');
    await until(() => value("!document.querySelector('#retry').hidden"));
    await value("document.querySelector('#retry').click()");
    await until(() => value("!document.querySelector('#copy').disabled && document.querySelector('#status').textContent === ''"));
    assert.deepEqual(requests[2].messages, requests[3].messages);
    assert.ok(!JSON.stringify(requests).includes('private-sentinel'));
  }
  await value("document.querySelector('#close').click()");
  await until(async () => !(await getPanel()));
  await evaluate(top, 'getSelection().removeAllRanges()');
  await trigger();
  const empty = await attach((await until(getPanel)).targetId);
  await until(() => evaluate(empty, "document.querySelector('#status')?.innerText.includes('Выделите вопрос')"));
  if (!live) assert.equal(requests.length, 4);
  console.log(live ? 'PASS: live Russian answer, contextual English reply, close and empty selection' : 'PASS: activation, selected text only, bounds, chat context, 503/retry, close, empty selection');
} finally {
  if (targetId) await call('Target.closeTarget',{targetId}).catch(() => {});
  ws.close(); if (!live) ollama.close();
}
