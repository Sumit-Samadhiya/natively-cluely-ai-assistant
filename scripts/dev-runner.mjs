import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const preferredPort = Number.parseInt(process.env.DEV_PORT || '5180', 10);
const host = '127.0.0.1';

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function getAvailablePort(startPort) {
  let port = startPort;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortFree(port)) return port;
    port += 1;
  }
  return startPort;
}

function spawnProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    if (code && code !== 0) {
      process.exit(code || 1);
    }
  });

  return child;
}

async function waitForServer(port) {
  const url = `http://${host}:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore and retry until the dev server is ready.
    }
    await delay(500);
  }
  return false;
}

async function main() {
  const port = await getAvailablePort(preferredPort);
  const baseEnv = {
    NODE_ENV: 'development',
    VITE_DEV_SERVER_PORT: String(port),
    VITE_DEV_SERVER_URL: `http://${host}:${port}`,
  };

  console.log(`[dev-runner] Starting Vite on ${host}:${port}`);
  const devServer = spawnProcess('npm', ['run', 'dev', '--', '--host', host, '--port', String(port), '--strictPort', 'false'], baseEnv);

  const ready = await waitForServer(port);
  if (!ready) {
    console.error('[dev-runner] Vite did not become ready in time.');
    devServer.kill('SIGTERM');
    process.exit(1);
  }

  console.log(`[dev-runner] Vite ready. Launching Electron with ${baseEnv.VITE_DEV_SERVER_URL}`);
  spawnProcess('npm', ['run', 'electron:dev'], baseEnv);
}

main().catch((error) => {
  console.error('[dev-runner] Failed to launch app:', error);
  process.exit(1);
});
