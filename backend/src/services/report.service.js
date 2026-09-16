import { hybridSearch } from './search.service.js';
import { groqChat, groundedSystemPrompt } from './llm.service.js';
import { citationsFromChunks } from '../utils/citation.js';

const templates = {
  geological_summary: {
    title: 'Geological Summary',
    prompt: 'Draft a structured geological summary covering geological setting, exploration data, lithology, seam characteristics, structural interpretation, reserves evidence, and key findings.'
  },
  reserve_estimation: {
    title: 'Reserve Estimation',
    prompt: 'Draft a reserve-estimation report. Extract only documented reserve/resource figures, classification, methodology, units, assumptions and source evidence. Never calculate a new reserve unless the document explicitly provides the calculation.'
  },
  compliance_check: {
    title: 'Compliance Check',
    prompt: 'Draft a compliance-check report identifying documented statutory, environmental, safety, land, mine-plan and closure obligations, plus any stated gaps or non-compliances. Do not infer compliance where the document is silent.'
  },
  mine_closure: {
    title: 'Mine Closure Report',
    prompt: 'Draft a mine-closure report covering closure objectives, land reclamation, environmental measures, safety, monitoring, liabilities and post-closure actions using only evidence in the uploaded document.'
  },
  executive_brief: { title: 'Executive Brief', prompt: 'Draft a concise executive brief covering documented operational performance, resources/reserves, material risks, compliance observations and management-relevant findings. Use only source evidence.' },
  operational_review: { title: 'Operational Review', prompt: 'Draft an operational review covering documented production, mine/project performance, quality indicators, delays, safety observations and operational constraints. Use only source evidence.' }
};

export async function generateReport({ documentId, template }) {
  const selected = templates[template];
  if (!selected) throw new Error(`Unknown report template: ${template}`);
  const chunks = await hybridSearch({ documentId, query: selected.prompt, limit: 14 });
  const citations = citationsFromChunks(chunks);
  const evidence = chunks.map((c, i) => `SOURCE ${i + 1} — Page ${c.page}\n${c.text}`).join('\n\n');

  const content = await groqChat([
    { role: 'system', content: groundedSystemPrompt() },
    { role: 'user', content: `${selected.prompt}\n\nCreate a professional report with headings and bullet points. Cite every factual statement with [Page N].\n\nEVIDENCE:\n${evidence}` }
  ], { temperature: 0, maxTokens: 3000 });

  return { title: selected.title, content, citations };
}

export { templates };
