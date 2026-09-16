import { buildApp } from './app.js';
import { connectMongo } from './db/mongodb.js';
import { config } from './config/config.js';

await connectMongo();
const app = buildApp();
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`CMPDI AI API running at http://localhost:${config.port}`);
