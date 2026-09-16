import { MongoClient } from 'mongodb';
import { config } from '../config/config.js';

let client;
let db;

export async function connectMongo() {
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db(config.mongoDb);
  await db.collection('documents').createIndex({ _id: 1 });
  await db.collection('chunks').createIndex({ documentId: 1, page: 1 });
  await db.collection('pages').createIndex({ documentId: 1, page: 1 }, { unique: true });
  return db;
}

export function getDb() {
  if (!db) throw new Error('MongoDB is not connected');
  return db;
}

export async function closeMongo() {
  if (client) await client.close();
}
