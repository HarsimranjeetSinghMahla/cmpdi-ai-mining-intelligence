import { getDashboard, deriveAnomalies, projectSeries } from '../services/analytics.service.js';
export async function analyticsRoutes(app){
  app.get('/api/v1/dashboard/:id', async (request,reply)=>{ const data=await getDashboard(request.params.id); if(!data)return reply.code(404).send({error:'Document not found'}); return reply.send(data); });
  app.get('/api/v1/analytics/:id', async (request,reply)=>{ const data=await getDashboard(request.params.id); if(!data)return reply.code(404).send({error:'Document not found'}); return reply.send(data.analytics); });
  app.get('/api/v1/insights/:id', async (request,reply)=>{ const data=await getDashboard(request.params.id); if(!data)return reply.code(404).send({error:'Document not found'}); return reply.send({insights:data.insights}); });
  app.get('/api/v1/anomalies/:id', async (request,reply)=>{ const data=await getDashboard(request.params.id); if(!data)return reply.code(404).send({error:'Document not found'}); return reply.send({anomalies:deriveAnomalies(data)}); });
  app.get('/api/v1/outlook/:id', async (request,reply)=>{ const data=await getDashboard(request.params.id); if(!data)return reply.code(404).send({error:'Document not found'}); return reply.send({outlook:projectSeries(data)}); });
}
