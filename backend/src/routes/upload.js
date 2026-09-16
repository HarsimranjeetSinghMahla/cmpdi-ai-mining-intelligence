import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { processPdf } from '../services/worker.service.js';
import { config } from '../config/config.js';
import { getDb } from '../db/mongodb.js';

export async function uploadRoutes(app) {
  app.post('/api/v1/upload', async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: 'PDF file is required' });
    if (part.mimetype !== 'application/pdf' && !part.filename.toLowerCase().endsWith('.pdf')) {
      return reply.code(400).send({ error: 'Only PDF files are accepted' });
    }

    await fs.mkdir(config.uploadDir, { recursive: true });
    const documentId = randomUUID();
    const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(config.uploadDir, `${documentId}-${safeName}`);
    await fs.writeFile(filePath, await part.toBuffer());

    try {
      const analytics = await processPdf(filePath, part.filename, documentId);
      const db = getDb();
      await db.collection('documents').updateOne(
        { _id: documentId },
        { $set: { filename: part.filename, fileUrl: `/uploads/${path.basename(filePath)}`, createdAt: new Date(), analytics } },
        { upsert: true }
      );
      return reply.send({ success: true, document: { id: documentId, filename: part.filename, fileUrl: `/uploads/${path.basename(filePath)}`, ...analytics } });
    } catch (error) {
      await fs.rm(filePath, { force: true });
      return reply.code(500).send({ error: error.message });
    }
  });

  app.get('/api/v1/documents', async (_request, reply) => {
    const docs = await getDb().collection('documents').find({}, { projection: { filename: 1, createdAt: 1, analytics: 1 } }).sort({ createdAt: -1 }).limit(50).toArray();
    return reply.send({ documents: docs.map(d => ({ id: d._id, ...d })) });
  });

  app.get('/api/v1/documents/:id', async (request, reply) => {
    const doc = await getDb().collection('documents').findOne({ _id: request.params.id });
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return reply.send({ document: doc });
  });
}
