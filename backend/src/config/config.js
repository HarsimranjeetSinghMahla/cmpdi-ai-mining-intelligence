import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  mongoDb: process.env.MONGODB_DB || 'cmpdi_ai',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  workerUrl: process.env.WORKER_URL || 'http://localhost:5001',
  uploadDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads'),
  corsOrigin: process.env.CORS_ORIGIN || true
};
