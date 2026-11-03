// Checks that a RUNNING dev server does not reload pages in a loop.
// Opens each page in headless Edge/Chrome, watches it for a while and fails if
// the page navigates again or Turbopack sends a "restart"/"reloadPage" HMR
// message without any file having changed.
//
// Usage (dev server already running):
//   npm run check:dev-reload                       # http://localhost:3000, / and /guide
//   npx tsx scripts/dev-reload-check.ts http://localhost:3000 / /admin/audit
// BROWSER_PATH overrides the browser executable.
//
// If it fails on an unchanged checkout, the Turbopack dev cache is stale:
// stop the dev server and run `npm run dev:clean`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base = "http://localhost:3000", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/", "/guide"];
const WATCH_MS = Number(process.env.WATCH_MS ?? 12_000);
let PORT = 9300 + Math.floor(Math.random() * 400);

const CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const browser = CANDIDATES.find((p) => p && existsSync(p));
if (!browser) {
  console.log("SKIP  no Edge or Chrome found; set BROWSER_PATH");
  process.exit(0);
}

type Cdp = { method?: string; params?: { frame?: { parentId?: string }; response?: { payloadData?: string } } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function watch(url: string) {
  PORT++; // a fresh debugging port per page: Edge helpers can outlive the previous run
  const profile = mkdtempSync(join(tmpdir(), "kyc-reload-"));
  const proc = spawn(browser!, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let wsUrl: string | undefined;
    for (let i = 0; i < 150 && !wsUrl; i++) {
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
        wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
      } catch {}
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error("browser did not start");

    const ws = new WebSocket(wsUrl);
    let navigations = 0;
    let connected = false;
    const reloads: string[] = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as Cdp;
      if (msg.method === "Page.frameNavigated" && !msg.params?.frame?.parentId) navigations++;
      if (msg.method === "Network.webSocketFrameReceived") {
        const data = String(msg.params?.response?.payloadData ?? "");
        if (data.includes('"turbopack-connected"')) connected = true;
        if (/"type":"restart"|"type":"reloadPage"/.test(data)) reloads.push(data.slice(0, 160));
      }
    };
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const send = (method: string, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
    send("Page.enable");
    send("Network.enable");
    send("Page.navigate", { url });

    // Wait for the first load (compiling can be slow), then watch.
    for (let t = 0; t < 120_000 && !connected; t += 250) await sleep(250);
    if (!connected) throw new Error("page never connected to the dev server's HMR socket");
    await sleep(WATCH_MS);
    ws.close();
    return { navigations, reloads };
  } finally {
    // Edge on Windows detaches helper processes, so also match on our debugging port.
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      for (let i = 0; i < 2; i++) {
        await sleep(500);
        spawnSync("powershell", ["-NoProfile", "-Command",
          `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*remote-debugging-port=${PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore" });
      }
    } else proc.kill("SIGKILL");
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  let failed = 0;
  for (const p of pages) {
    const url = new URL(p, base).toString();
    try {
      const { navigations, reloads } = await watch(url);
      if (navigations > 1 || reloads.length) {
        failed++;
        console.log(`FAIL  ${p}: ${navigations} navigations, ${reloads.length} restart/reload messages in ${WATCH_MS / 1000}s`);
        for (const r of reloads.slice(0, 3)) console.log(`      ${r}`);
      } else console.log(`PASS  ${p} loaded once and stayed put for ${WATCH_MS / 1000}s`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${p}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed) console.log("\nPages reload with no file changes. Stop the dev server and run `npm run dev:clean` (clears the Turbopack dev cache in .next/dev).");
  else console.log("\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
