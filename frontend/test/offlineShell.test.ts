import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { writeOfflineWorker } from "../build/offline";

const template = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "dialog-offline-test-"));
  const files: Record<string, string> = {
    "index.html": '<html><script type="module" src="/assets/entry.js"></script></html>',
    "assets/entry.js": 'import("./table.js")', "assets/table.js": "export const ready = true;",
    "assets/main.css": "body {color: black}", "manifest.webmanifest": "{}", "icon.svg": "<svg/>",
  };
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "sw.js"), template);
  for (const [name, value] of Object.entries(files)) await writeFile(join(directory, name), value);
  await writeOfflineWorker(directory);
  return { directory, files, worker: await readFile(join(directory, "sw.js"), "utf8") };
}

function browser(worker: string, files: Record<string, string>) {
  const handlers: Record<string, (event: any) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  let online = true, activated = false;
  const path = (request: Request | string) => new URL(typeof request === "string" ? request : request.url, "https://dialog.test").pathname;
  const fetch = async (request: Request | string) => {
    if (!online) throw new Error("offline");
    const name = path(request).replace(/^\//, "") || "index.html";
    if (!(name in files)) throw new Error(`missing ${name}`);
    return new Response(files[name], { headers: { "content-type": name.endsWith(".html") ? "text/html" : "text/plain" } });
  };
  const caches = {
    async open(key: string) {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key)!;
      return {
        async addAll(urls: string[]) { for (const url of urls) store.set(path(url), await fetch(url)); },
        async put(key: Request | string, value: Response) { store.set(path(key), value); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(key: string) { return stores.delete(key); },
    async match(key: Request | string) {
      for (const store of stores.values()) { const hit = store.get(path(key)); if (hit) return hit.clone(); }
      return undefined;
    },
  };
  runInNewContext(worker, { URL, Set, Promise, fetch, caches, self: {
    location: { origin: "https://dialog.test" }, clients: { async claim() {} },
    async skipWaiting() { activated = true; },
    addEventListener(name: string, handler: (event: any) => void) { handlers[name] = handler; },
  } });
  return {
    stores, activated: () => activated, offline: () => { online = false; },
    async event(name: string) { let waiting: Promise<void> = Promise.resolve(); handlers[name]({ waitUntil(p: Promise<void>) { waiting = p; } }); await waiting; },
    async request(url: string, mode = "same-origin") {
      let response: Promise<Response> | undefined;
      handlers.fetch({ request: { url: `https://dialog.test${url}`, method: "GET", mode }, respondWith(p: Promise<Response>) { response = p; } });
      return response;
    },
  };
}

test("first installation serves the HTML, entry JS, CSS and never-visited lazy screen offline", async () => {
  const { directory, files, worker } = await fixture();
  try {
    const page = browser(worker, files);
    await page.event("install");
    assert.equal(page.activated(), true);
    page.stores.set("unrelated-app-cache", new Map());
    await page.event("activate");
    assert.ok(page.stores.has("unrelated-app-cache"));
    page.offline();
    assert.match(await (await page.request("/", "navigate"))!.text(), /entry.js/);
    for (const name of ["assets/entry.js", "assets/main.css", "assets/table.js"]) {
      assert.equal(await (await page.request(`/${name}`))!.text(), files[name]);
    }
    assert.equal(await page.request("/api/health"), undefined);
    assert.equal(await page.request("/v1/realtime"), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("incomplete precaching does not activate a half-installed worker", async () => {
  const { directory, files, worker } = await fixture();
  try {
    delete files["assets/table.js"];
    const page = browser(worker, files);
    await assert.rejects(page.event("install"), /missing assets\/table.js/);
    assert.equal(page.activated(), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("changing an asset changes the worker cache version", async () => {
  const { directory, worker } = await fixture();
  try {
    await writeFile(join(directory, "assets/table.js"), "new content");
    await writeFile(join(directory, "sw.js"), template);
    await writeOfflineWorker(directory);
    const updated = await readFile(join(directory, "sw.js"), "utf8");
    assert.notEqual(worker.match(/dialog-build-[a-f0-9]+/)?.[0], updated.match(/dialog-build-[a-f0-9]+/)?.[0]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
