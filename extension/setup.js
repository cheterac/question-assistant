const api = globalThis.browser ?? chrome;
const origin = api.runtime.getURL('').replace(/\/$/, '');
const allowedOrigin = origin.startsWith('safari-web-extension://') ? origin + '*' : origin;
document.querySelector('#serve').textContent =
  "OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NO_CLOUD=1 OLLAMA_ORIGINS='" + allowedOrigin + "' ollama serve";
