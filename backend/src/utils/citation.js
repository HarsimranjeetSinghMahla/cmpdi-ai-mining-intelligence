export function normalizeCitation(c) {
  return {
    id: c.id,
    page: Number(c.page),
    bbox: {
      x0: Number(c.bbox?.x0 ?? 0),
      y0: Number(c.bbox?.y0 ?? 0),
      x1: Number(c.bbox?.x1 ?? 0),
      y1: Number(c.bbox?.y1 ?? 0)
    },
    text: String(c.text || '').slice(0, 1200),
    section: c.section || null
  };
}

export function citationsFromChunks(chunks) {
  return chunks.map((chunk, i) => normalizeCitation({
    id: `citation_${i + 1}`,
    page: chunk.page,
    bbox: chunk.bbox,
    text: chunk.text,
    section: chunk.metadata?.section
  }));
}

export function validateCitationPages(answer, citations) {
  const refs = [...answer.matchAll(/\[(?:page|p)\s*(\d+)\]/gi)].map(m => Number(m[1]));
  const validPages = new Set(citations.map(c => c.page));
  return refs.every(p => validPages.has(p));
}
