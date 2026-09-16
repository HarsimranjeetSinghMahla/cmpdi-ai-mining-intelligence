import { getDb } from '../db/mongodb.js';
import { hybridSearch } from '../services/search.service.js';
import { groqChat, groundedSystemPrompt } from '../services/llm.service.js';
import { citationsFromChunks, validateCitationPages } from '../utils/citation.js';

export async function queryRoutes(app) {
  app.post('/api/v1/query', async (request, reply) => {
    const { documentId, query, filters = {} } = request.body || {};
    if (!documentId || !query) return reply.code(400).send({ error: 'documentId and query are required' });

    const doc = await getDb().collection('documents').findOne({ _id: documentId });
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const chunks = await hybridSearch({ documentId, query, section: filters.section, limit: 8 });
    if (!chunks.length) return reply.send({ answer: 'Insufficient evidence in the uploaded documents.', citations: [] });

    const citations = citationsFromChunks(chunks);
    const evidence = chunks.map((c, i) => `SOURCE ${i + 1} — Page ${c.page}\n${c.text}`).join('\n\n');
    let answer = await groqChat([
      { role: 'system', content: groundedSystemPrompt() },
      { role: 'user', content: `Question: ${query}\n\nAnswer using only this evidence. Cite factual claims with [Page N].\n\nEVIDENCE:\n${evidence}` }
    ]);

    if (!validateCitationPages(answer, citations)) {
      answer = 'Insufficient evidence in the uploaded documents.';
    }

    return reply.send({ answer, citations, retrieved: chunks.map(c => ({ page: c.page, score: c.finalScore, text: c.text.slice(0, 300) })) });
  });
}
