// Industry / domain detection used for the "domain relevance" score.

export const INDUSTRIES: { key: string; label: string; pattern: RegExp }[] = [
  { key: "fintech", label: "Fintech & payments", pattern: /\b(fintech|payments?|banking|bank|lending|credit card|financial services|neobank|insurtech|insurance|wealth|trading platform|remittance)\b/i },
  { key: "crypto", label: "Crypto & web3", pattern: /\b(crypto|blockchain|web3|defi|bitcoin|ethereum|exchange|digital assets|stablecoin)\b/i },
  { key: "healthcare", label: "Healthcare & life sciences", pattern: /\b(health ?care|healthtech|clinical|patients?|medical|hospital|pharma|biotech|telehealth|life sciences)\b/i },
  { key: "edtech", label: "Education", pattern: /\b(edtech|education|learning platform|students|e-learning|school|university|courses)\b/i },
  { key: "ecommerce", label: "E-commerce & retail", pattern: /\b(e-?commerce|retail|marketplace|online store|shopify|merchants?|consumer goods|d2c|dtc)\b/i },
  { key: "devtools", label: "Developer tools & infrastructure", pattern: /\b(developer tools?|developer platform|devtools|developer experience|infrastructure|cloud platform|observability|open source|api platform|databases?)\b/i },
  { key: "saas", label: "B2B SaaS", pattern: /\b(saas|b2b software|enterprise software|productivity (tool|software|platform)|workflow|crm)\b/i },
  { key: "ai", label: "AI & machine learning", pattern: /\b(artificial intelligence|\bai\b|machine learning|llms?|generative|foundation models?)\b/i },
  { key: "media", label: "Media, music & entertainment", pattern: /\b(media|music|streaming|entertainment|gaming|games|video|podcasts?|publishing|creators?)\b/i },
  { key: "travel", label: "Travel & hospitality", pattern: /\b(travel|hospitality|hotels?|booking|airlines?|short[- ]let|vacation rentals?|tourism)\b/i },
  { key: "logistics", label: "Logistics & mobility", pattern: /\b(logistics|delivery|shipping|freight|supply chain|mobility|ride[- ]hailing|fleet)\b/i },
  { key: "security", label: "Cybersecurity", pattern: /\b(cyber ?security|security platform|threat|identity|zero trust)\b/i },
  { key: "public", label: "Government & public sector", pattern: /\b(government|public sector|civic|federal|municipal|ngo|non-?profit|charity)\b/i },
  { key: "realestate", label: "Real estate & property", pattern: /\b(real estate|proptech|property|mortgage|housing|rental)\b/i },
  { key: "marketing-tech", label: "Marketing & advertising", pattern: /\b(adtech|advertising|marketing platform|martech|agency)\b/i },
  { key: "hr-tech", label: "HR & recruiting tech", pattern: /\b(hr tech|hris|payroll platform|recruiting platform|future of work|remote work platform|employer of record)\b/i },
  { key: "fashion", label: "Fashion & beauty", pattern: /\b(fashion|apparel|beauty|cosmetics|luxury|streetwear)\b/i },
];

export const INDUSTRY_LABEL = new Map(INDUSTRIES.map((i) => [i.key, i.label]));

/** Industries a text mentions at least `minHits` times (reduces noise from passing mentions). */
export function detectIndustries(text: string, minHits = 1, max = 3): string[] {
  const scored: [string, number][] = [];
  for (const i of INDUSTRIES) {
    const re = new RegExp(i.pattern.source, "gi");
    const hits = text.match(re)?.length ?? 0;
    if (hits >= minHits) scored.push([i.key, hits]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k);
}
