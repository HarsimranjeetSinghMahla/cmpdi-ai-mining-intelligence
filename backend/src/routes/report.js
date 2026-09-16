import { generateReport, templates } from '../services/report.service.js';

export async function reportRoutes(app) {
  app.post('/api/v1/generate-report', async (request, reply) => {
    const { documentId, template } = request.body || {};
    if (!documentId || !template) return reply.code(400).send({ error: 'documentId and template are required' });
    try {
      return reply.send({ success: true, report: await generateReport({ documentId, template }) });
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.get('/api/v1/report-templates', async (_request, reply) => {
    return reply.send({ templates: Object.entries(templates).map(([id, x]) => ({ id, title: x.title })) });
  });
}
