type KeywordDocument = {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
};

function tokenize(value: string) {
  const normalized = value.toLowerCase();
  const segments = normalized.match(/[a-z0-9+#.]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  const tokens = new Set<string>();

  for (const segment of segments) {
    if (/^[\u4e00-\u9fff]+$/.test(segment)) {
      if (segment.length <= 8) tokens.add(segment);
      for (let index = 0; index < segment.length - 1; index += 1) {
        tokens.add(segment.slice(index, index + 2));
      }
    } else {
      tokens.add(segment);
    }
  }

  return [...tokens];
}

export function rankDocumentsByKeywords<T extends KeywordDocument>(input: {
  documents: T[];
  query: string;
  company: string;
  jobTitle: string;
  limit?: number;
}) {
  const queryTerms = tokenize(input.query);
  const company = input.company.trim().toLowerCase();
  const jobTitle = input.jobTitle.trim().toLowerCase();

  return input.documents
    .map((document) => {
      const searchable = [document.title, document.content, JSON.stringify(document.metadata)].join(" ").toLowerCase();
      const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
      const metadataCompany = String(document.metadata.company ?? "").toLowerCase();
      const metadataRole = String(document.metadata.role ?? "").toLowerCase();
      const companyBoost = company && (metadataCompany === company || searchable.includes(company)) ? 30 : 0;
      const roleBoost = jobTitle && (metadataRole.includes(jobTitle) || searchable.includes(jobTitle)) ? 20 : 0;
      return {
        document,
        matchedTerms: matchedTerms.slice(0, 12),
        keywordScore: companyBoost + roleBoost + matchedTerms.length
      };
    })
    .filter((item) => item.keywordScore > 0)
    .sort((left, right) => right.keywordScore - left.keywordScore)
    .slice(0, input.limit ?? 24);
}
