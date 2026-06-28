import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import pool from './db';
import authRoutes from './routes/auth';
import locationRoutes from './routes/locations';
import profileRoutes from './routes/profiles';
import seaCarrierRoutes from './routes/seaCarriers';
import seaHblRoutes from './routes/seaHbls';
import seaMblRoutes from './routes/seaMbls';
import seaMloRoutes from './routes/seaMlos';
import seaTransmissionRoutes from './routes/seaTransmissions';
import seaImporterRoutes from './routes/seaImporters';
import seaPendingRoutes from './routes/seaPendingStatement';
import userRoutes from './routes/users';
import { applyAppEnv } from './utils/env';
import { logger, sanitizeBody } from './utils/logger';

dotenv.config();
const appEnv = applyAppEnv();

const app = express();
const PORT = Number(process.env.PORT || 5100);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const message = `${req.method} ${req.path} -> ${status} (${ms}ms)`;

    if (status >= 500) {
      logger.error('HTTP', message);
    } else if (status >= 400) {
      logger.warn('HTTP', message, {
        query: req.query,
        body: sanitizeBody(req.body),
      });
    } else {
      logger.info('HTTP', message);
    }
  });
  next();
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      app: 'ediss-sea-backend',
      status: 'OK',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('SERVER', 'Health check failed', error);
    res.status(500).json({
      app: 'ediss-sea-backend',
      status: 'ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/sea-mbls', seaMblRoutes);
app.use('/api/sea-hbls', seaHblRoutes);
app.use('/api/sea-transmissions', seaTransmissionRoutes);
app.use('/api/sea-carriers', seaCarrierRoutes);
app.use('/api/sea-mlos', seaMloRoutes);
app.use('/api/sea-importers', seaImporterRoutes);
app.use('/api/sea-pending', seaPendingRoutes);

app.use((req: express.Request, res: express.Response) => {
  logger.warn('HTTP', `404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: 'Route not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('EXPRESS', 'Unhandled error', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info('SERVER', `EDISS Sea backend running on http://localhost:${PORT}`, {
    env: appEnv,
    port: PORT,
  });
});

export default app;
