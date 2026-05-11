import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import open from 'open';
import { listUploads, listLogs, stats, DB_PATH } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startDashboard({ port = 7787, openBrowser = true } = {}) {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  app.get('/api/stats', (_req, res) => {
    res.json({ ...stats(), dbPath: DB_PATH });
  });

  app.get('/api/uploads', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    res.json(listUploads({ limit, status: req.query.status, search: req.query.search }));
  });

  app.get('/api/logs', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    res.json(listLogs({ limit, level: req.query.level }));
  });

  return new Promise(resolve => {
    const server = app.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`Dashboard running at ${url}`);
      console.log(`DB: ${DB_PATH}`);
      console.log('Press Ctrl+C to stop.');
      if (openBrowser) open(url).catch(() => {});
      resolve(server);
    });
  });
}
