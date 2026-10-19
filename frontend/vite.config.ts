import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const workspace = fileURLToPath(new URL('.', import.meta.url));
const authority = '127.0.0.1:5173';

// configureServer registers this before Vite's file and proxy middleware.
function localBoundary(): Plugin {
  return {
    name: 'exact-local-authority',
    enforce: 'pre',
    configureServer(server) {
      const options = server.config.server;
      if (options.host !== '127.0.0.1' || options.port !== 5173 ||
          !options.strictPort || options.hmr !== false || options.ws !== false ||
          options.cors !== false || options.open !== false) {
        throw new Error('The approved local development boundary was changed');
      }
      server.middlewares.use((request, response, next) => {
        const hosts: string[] = [];
        let forwarded = false;
        for (let index = 0; index < request.rawHeaders.length; index += 2) {
          const key = request.rawHeaders[index]?.toLowerCase();
          if (key === 'host') hosts.push(request.rawHeaders[index + 1] ?? '');
          if (key === 'forwarded' || key?.startsWith('x-forwarded-')) forwarded = true;
        }
        const target = request.url ?? '';
        if (hosts.length !== 1 || hosts[0] !== authority || forwarded ||
            !target.startsWith('/') || target.startsWith('//') || target.includes('\\') ||
            request.headers.upgrade !== undefined ||
            request.headers.connection?.split(',').some(token => token.trim().toLowerCase() === 'upgrade')) {
          response.writeHead(403, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Connection': 'close',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end('Local request rejected');
          return;
        }
        let pathname: string;
        try { pathname = decodeURIComponent(target.split('?')[0] ?? ''); }
        catch { response.writeHead(400); response.end('Local request rejected'); return; }
        const segments = pathname.split('/').map(segment => segment.replace(/[ .]+$/g, '').toLowerCase());
        if (pathname.includes('\\') || pathname.includes('\0') || segments.some(segment =>
          (segment.includes(':') && !/^[a-z]:$/.test(segment)) || segment === '.git' || segment === '.npmrc' ||
          /^\.env(?:\.|$)/.test(segment) || /\.(?:crt|pem|key|p12)$/.test(segment))) {
          response.writeHead(403, { 'Cache-Control': 'no-store' });
          response.end('Local file access rejected');
          return;
        }
        next();
      });
      server.httpServer?.on('upgrade', (_request, socket) => {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      });
    },
  };
}

export default defineConfig({
  root: workspace,
  envDir: false,
  envPrefix: [],
  publicDir: false,
  plugins: [localBoundary(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false,
    hmr: false,
    ws: false,
    cors: false,
    forwardConsole: false,
    allowedHosts: ['127.0.0.1'],
    fs: {
      strict: true,
      allow: [workspace],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.key', '**/*.p12', '**/.npmrc'],
    },
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
    proxy: {
      '^/api/v1/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: false,
        xfwd: false,
        followRedirects: false,
        timeout: 30000,
        proxyTimeout: 30000,
      },
    },
  },
  build: { sourcemap: false },
});
