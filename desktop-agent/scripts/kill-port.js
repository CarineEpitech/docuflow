/**
 * Kill any process listening on the given port (Windows + Unix).
 * Usage: node scripts/kill-port.js 9000
 */
const { execSync } = require('child_process');
const port = process.argv[2] || '9000';

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano`, { encoding: 'utf8' });
    const pids = [...new Set(
      out.split('\n')
        .filter(line => line.includes(`:${port} `) || line.includes(`:${port}\r`))
        .map(line => line.trim().split(/\s+/).pop())
        .filter(p => p && /^\d+$/.test(p) && p !== '0')
    )];
    if (pids.length > 0) {
      console.log(`[kill-port] Killing PIDs on :${port} →`, pids.join(', '));
      pids.forEach(pid => {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' }); } catch (_) {}
      });
    }
  } else {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
  }
} catch (_) {
  // Port not in use — nothing to do
}
