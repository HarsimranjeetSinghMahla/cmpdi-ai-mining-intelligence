import { getDb } from '../db/mongodb.js';
import { embedText } from './worker.service.js';

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

function lexicalScore(query, text) {
  const terms = query.toLowerCase().split(/\W+/).filter(x => x.length > 2);
  const hay = text.toLowerCase();
  if (!terms.length) return 0;
  return terms.filter(t => hay.includes(t)).length / terms.length;
}

export async function hybridSearch({ documentId, query, section, limit = 8 }) {
  const db = getDb();
  const { embedding } = await embedText(query);

  let vectorResults = [];
  try {
    vectorResults = await db.collection('chunks').aggregate([
      {
        $vectorSearch: {
          index: 'chunk_vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: Math.max(50, limit * 10),
          limit: limit * 3,
          filter: section ? { 'metadata.section': section } : undefined
        }
      },
      { $project: { _id: 1, documentId: 1, chunkIndex: 1, page: 1, text: 1, bbox: 1, metadata: 1, score: { $meta: 'vectorSearchScore' } } }
    ]).toArray();
  } catch {
    // Atlas vector index may not exist during local development.
  }

  if (!vectorResults.length) {
    const cursor = db.collection('chunks').find({ documentId, ...(section ? { 'metadata.section': section } : {}) });
    const all = await cursor.toArray();
    vectorResults = all.map(c => ({ ...c, score: cosine(embedding, c.embedding) }));
  }

  const candidates = vectorResults
    .filter(c => c.documentId === documentId)
    .map(c => ({
      ...c,
      lexical: lexicalScore(query, c.text),
      finalScore: 0.7 * Number(c.score || 0) + 0.3 * lexicalScore(query, c.text)
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  return candidates;
}
