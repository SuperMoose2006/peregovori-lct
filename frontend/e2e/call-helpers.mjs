// call-helpers.mjs — созвон в e2e: вход, выход и ход в звонке без микрофона.
//
// ПОЧЕМУ ХОД ИДЁТ ТЕКСТОМ В СОКЕТ СОЗВОНА. В созвоне поля ввода нет — ход
// делается голосом. У стенда распознавания нет (и у безголового браузера нет
// живого голоса), поэтому реплика уходит текстом в ТОТ ЖЕ голосовой сокет:
// сервер принимает текстовый ход в любом режиме (инвариант 7 — голос и
// клавиатура дают один ход), а ответ идёт голосовым путём — звук, лицо,
// субтитры. Ровно это и проверяется; распознавание проверяет классический
// прогон голоса стенда, а не этот файл.
export async function routeRealtime(page, observe = () => {}) {
  const servers = [];
  await page.routeWebSocket(/\/v1\/realtime/, (ws) => {
    const server = ws.connectToServer();
    servers.push(server);
    // Свой обработчик снимает автоматическую пересылку — пересылаем сами.
    server.onMessage((message) => { observe(message); ws.send(message); });
  });
  return {
    servers,
    say(text) {
      const server = servers[servers.length - 1];
      server.send(JSON.stringify({ type: "input.append", input: { text } }));
      server.send(JSON.stringify({ type: "input.commit" }));
    },
  };
}

export async function enterCall(page) {
  await page.locator(".call-go").click();
  await page.waitForSelector('.call[data-status="listening"]', { timeout: 15000 });
}

export async function leaveCall(page) {
  await page.locator(".call-bar .cb.end").click();
  await page.waitForSelector(".call", { state: "detached", timeout: 15000 });
}
