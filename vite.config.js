import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import handler from './api/messages.js';

const apiDevPlugin = () => ({
  name: 'api-dev-middleware',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/messages')) return next();

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          if (body) req.body = JSON.parse(body);
        } catch {
          req.body = body;
        }

        const mockRes = {
          statusCode: 200,
          status(code) {
            this.statusCode = code;
            res.statusCode = code;
            return this;
          },
          setHeader(k, v) {
            res.setHeader(k, v);
            return this;
          },
          json(data) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = this.statusCode || 200;
            res.end(JSON.stringify(data));
          },
          end() {
            res.end();
          },
        };

        try {
          await handler(req, mockRes);
        } catch (err) {
          mockRes.status(500).json({ error: String(err) });
        }
      });
    });
  },
});

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
});
