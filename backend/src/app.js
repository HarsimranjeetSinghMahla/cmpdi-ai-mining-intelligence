import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config/config.js';
import { uploadRoutes } from './routes/upload.js';
import { queryRoutes } from './routes/query.js';
import { reportRoutes } from './routes/report.js';
import { analyticsRoutes } from './routes/analytics.js';
import { getDb } from './db/mongodb.js';

export function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 100 * 1024 * 1024 });
  app.register(cors, { origin: config.corsOrigin });
  app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  app.register(fastifyStatic, { root: config.uploadDir, prefix: '/uploads/' });

  app.get('/api/v1/health', async () => {
    let mongodb = 'offline';
    try { await getDb().command({ ping: 1 }); mongodb = 'online'; } catch {}
    let worker = 'offline';
    try { const r = await fetch(`${config.workerUrl}/health`, { signal: AbortSignal.timeout(1200) }); worker = r.ok ? 'online' : 'offline'; } catch {}
    return { ok: mongodb === 'online', service: 'cmpdi-ai', llm: config.groqApiKey ? 'configured' : 'missing-key', mongodb, worker };
  });
  app.register(uploadRoutes);
  app.register(queryRoutes);
  app.register(reportRoutes);
  app.register(analyticsRoutes);
  return app;
}
