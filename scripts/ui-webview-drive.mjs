const list = await fetch("http://127.0.0.1:9222/json").then((response) => response.json());
const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!page) throw new Error("No WebView page target");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
function send(method, params = {}) {
  const messageId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(messageId, resolve);
    ws.send(JSON.stringify({ id: messageId, method, params }));
    setTimeout(() => reject(new Error(`timeout ${method}`)), 8000);
  });
}
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});
async function evaluate(expression) {
  const reply = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 300));
  return reply.result?.result?.value;
}
const before = await evaluate("document.body.innerText.slice(0, 400)");
console.log(before);
const opened = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('Compete') && item.innerText.includes('stake')); if (!button) return 'missing'; button.click(); return 'opened'; })()`);
console.log(opened);
await new Promise((resolve) => setTimeout(resolve, 800));
const lobby = await evaluate("document.body.innerText.slice(0, 900)");
console.log("---");
console.log(lobby);
if (process.env.MWA_CLICK === "1") {
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Connect wallet'); if (!button) return 'missing'; button.click(); return 'clicked'; })()`);
  console.log(clicked);
}
ws.close();
