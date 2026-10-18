/**
 * Real-Chromium checks: serve the project with Vite, open `page` in headless Chromium (CHROME_BIN)
 * over the DevTools protocol, evaluate `expression` there and return its value. Used by the audio
 * and the interface integration tests; skipped where there is no Chromium.
 */
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const hasChrome = existsSync(chrome);

async function waitForClose(closed: Promise<void>, timeoutMs = 5000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      closed.then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function inChromium(page: string, expression: string, flags: string[] = []): Promise<{ value: unknown; exception?: unknown }> {

  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  const profile = await mkdtemp(join(tmpdir(), 'breakery-audio-'));
  let browser: ReturnType<typeof spawn> | undefined;
  let browserClosed: Promise<void> | undefined;
  let socket: WebSocket | undefined;
  try {
    await server.listen();
    const address = server.httpServer!.address() as { port: number };
    browser = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-extensions', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', ...flags, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });
    // Register immediately: close can precede finally, and follows exit and stdio closure.
    browserClosed = new Promise(resolve => browser!.once('close', () => resolve()));
    const endpoint = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chrome CDP startup timeout: ' + output)), 15000);
      browser!.stderr!.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]!); } });
      browser!.on('error', reject);
    });
    const origin = new URL(endpoint).origin.replace('ws:', 'http:');
    const targets = await (await fetch(`${origin}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    socket = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error('CDP connection failed')); });
    let seq = 0;
    const pending = new Map<number, { resolve(v: any): void; reject(e: Error): void }>();
    let loaded: (() => void) | undefined;
    socket.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.method === 'Page.loadEventFired') loaded?.(); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p?.reject(new Error(JSON.stringify(m.error))) : p?.resolve(m.result); } };
    const send = (method: string, params: object) => new Promise<any>((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket!.send(JSON.stringify({ id, method, params })); });
    await send('Page.enable', {});
    const pageLoaded = new Promise<void>(resolve => loaded = resolve);
    await send('Page.navigate', { url: `http://127.0.0.1:${address.port}${page}` });
    await pageLoaded;
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return { value: result.result?.value, exception: result.exceptionDetails };
  } finally {
    try {
      // Let Chromium shut down its children and flush the profile before removing it.
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 0, method: 'Browser.close' }));
      if (browser && browserClosed) {
        const signal = (sig: NodeJS.Signals) => {
          if (process.platform === 'win32' || !browser!.pid) { browser!.kill(sig); return; }
          try { process.kill(-browser!.pid, sig); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        };
        if (!await waitForClose(browserClosed)) {
          // A separate process group lets fallback termination reach Chromium's children too.
          signal('SIGTERM');
          if (!await waitForClose(browserClosed)) {
            signal('SIGKILL');
            if (!await waitForClose(browserClosed)) throw new Error('Chromium did not close after SIGKILL');
          }
        }
      }
      // Late filesystem activity can still race recursive removal. Exhausted retries reject.
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } finally {
      socket?.close();
      await server.close();
    }
  }
}
