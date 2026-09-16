import fs from 'node:fs/promises';
import { config } from '../config/config.js';

async function workerFetch(path, options = {}) {
  const response = await fetch(`${config.workerUrl}${path}`, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { detail: text }; }
  if (!response.ok) throw new Error(data.detail || `Worker error ${response.status}`);
  return data;
}

export async function processPdf(filePath, filename, documentId) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  form.append('document_id', documentId);
  return workerFetch('/process', { method: 'POST', body: form });
}

export async function embedText(text) {
  return workerFetch('/embed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
}
