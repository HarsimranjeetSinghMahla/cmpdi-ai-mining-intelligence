import { config } from '../config/config.js';

export async function groqChat(messages, { temperature = 0, maxTokens = 1800 } = {}) {
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY is not configured in backend/.env');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.groqApiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq request failed (${response.status})`);
  }
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export function groundedSystemPrompt() {
  return `You are CMPDI AI, an evidence-grounded mining document analyst.\n\nRULES:\n1. Use ONLY the supplied document evidence.\n2. Do not use outside knowledge.\n3. Do not invent numbers, dates, borehole IDs, reserves, seam names, locations, compliance status, or conclusions.\n4. Every material factual claim must end with a citation like [Page 12]. Use only page numbers present in the evidence.\n5. If the evidence does not support the answer, say exactly: "Insufficient evidence in the uploaded documents."\n6. When evidence conflicts, state the conflict and cite each relevant page.\n7. Preserve units and numeric precision from the source.\n8. Keep the answer concise and professional.`;
}
