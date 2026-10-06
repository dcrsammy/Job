// Role families let us compare "Frontend Developer" with "UI Engineer" or
// "Account Executive" with "Sales Representative" without an LLM.
import { simplify } from "../text";

export interface RoleFamily {
  key: string;
  label: string;
  group: string;
  patterns: RegExp;
}

export const ROLE_FAMILIES: RoleFamily[] = [
  { key: "frontend", label: "Frontend engineering", group: "engineering", patterns: /\b(front[- ]?end|ui engineer|web developer|react developer|javascript developer)\b/ },
  { key: "backend", label: "Backend engineering", group: "engineering", patterns: /\b(back[- ]?end|api engineer|server[- ]side|platform engineer|java developer|python developer|golang|go engineer)\b/ },
  { key: "fullstack", label: "Full-stack engineering", group: "engineering", patterns: /\b(full[- ]?stack|product engineer)\b/ },
  { key: "mobile", label: "Mobile engineering", group: "engineering", patterns: /\b(mobile|ios|android|flutter|react native)\b.*\b(engineer|developer)\b|\b(ios|android) (engineer|developer)\b/ },
  { key: "devops", label: "DevOps / SRE / infrastructure", group: "engineering", patterns: /\b(devops|sre|site reliability|infrastructure|cloud engineer|platform reliability|systems engineer|production engineer)\b/ },
  { key: "security", label: "Security engineering", group: "engineering", patterns: /\b(security|appsec|infosec|penetration|threat|soc analyst)\b/ },
  { key: "qa", label: "QA / test engineering", group: "engineering", patterns: /\b(qa|quality assurance|test(ing)? engineer|sdet|test automation)\b/ },
  { key: "data-engineering", label: "Data engineering", group: "data", patterns: /\b(data engineer|analytics engineer|etl|data platform)\b/ },
  { key: "data-science", label: "Data science", group: "data", patterns: /\b(data scientist|data science|quantitative|statistician|research scientist)\b/ },
  { key: "data-analysis", label: "Data / business analysis", group: "data", patterns: /\b(data analyst|business analyst|analytics|bi analyst|insights analyst|reporting analyst)\b/ },
  { key: "ml", label: "Machine learning / AI", group: "engineering", patterns: /\b(machine learning|ml engineer|ai engineer|applied scientist|deep learning|nlp|computer vision|llm)\b/ },
  { key: "software", label: "Software engineering", group: "engineering", patterns: /\b(software|developer|programmer|engineer(ing)?)\b/ },
  { key: "design", label: "Product / UX / UI design", group: "design", patterns: /\b(designer|ux|ui\b|user experience|product design|design lead|visual design|interaction design)\b/ },
  { key: "product", label: "Product management", group: "product", patterns: /\b(product manager|product owner|product lead|head of product|pm\b|group product)\b/ },
  { key: "project", label: "Project / program management", group: "operations", patterns: /\b(project manager|program manager|delivery manager|scrum master|pmo)\b/ },
  { key: "marketing", label: "Marketing", group: "marketing", patterns: /\b(marketing|growth|seo|content strategist|brand|demand generation|social media|community manager|copywriter|media buyer)\b/ },
  { key: "sales", label: "Sales / business development", group: "sales", patterns: /\b(sales|account executive|business development|sdr|bdr|account manager|partnerships|solutions consultant|sales engineer|closer)\b/ },
  { key: "customer", label: "Customer success / support", group: "customer", patterns: /\b(customer success|customer support|support (engineer|specialist|agent)|customer experience|client success|technical support|help ?desk|implementation)\b/ },
  { key: "finance", label: "Finance / accounting", group: "finance", patterns: /\b(finance|accountant|accounting|controller|fp&a|bookkeeper|payroll|tax|treasury|auditor|financial analyst)\b/ },
  { key: "people", label: "People / HR / recruiting", group: "people", patterns: /\b(recruiter|recruiting|talent|people (partner|operations)|hr\b|human resources)\b/ },
  { key: "operations", label: "Operations", group: "operations", patterns: /\b(operations|ops\b|logistics|supply chain|procurement|office manager|chief of staff)\b/ },
  { key: "legal", label: "Legal / compliance", group: "legal", patterns: /\b(legal|counsel|lawyer|attorney|paralegal|compliance|privacy)\b/ },
  { key: "writing", label: "Writing / content / editorial", group: "marketing", patterns: /\b(writer|editor|content|technical writer|documentation|journalist|translator)\b/ },
  { key: "creative", label: "Video / creative production", group: "design", patterns: /\b(video|animator|motion|illustrator|creative|photograph)\b/ },
  { key: "education", label: "Teaching / training", group: "education", patterns: /\b(teacher|tutor|instructor|trainer|educator|curriculum|dozent)\b/ },
];

export const ROLE_FAMILY_BY_KEY = new Map(ROLE_FAMILIES.map((f) => [f.key, f]));

/** All role families a title belongs to (most specific first; "software" is a fallback). */
export function roleFamiliesForTitle(title: string): string[] {
  const t = simplify(title);
  const out: string[] = [];
  for (const f of ROLE_FAMILIES) if (f.patterns.test(t)) out.push(f.key);
  if (out.length > 1) return out.filter((k) => k !== "software");
  return out;
}

/** 0..1 similarity of two sets of role families. */
export function familySimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  for (const x of a) {
    for (const y of b) {
      if (x === y) return 1;
      const fx = ROLE_FAMILY_BY_KEY.get(x);
      const fy = ROLE_FAMILY_BY_KEY.get(y);
      if (!fx || !fy) continue;
      if (fx.group === fy.group) {
        // Generic "software" is close to any engineering specialty.
        const s = x === "software" || y === "software" ? 0.85 : 0.65;
        best = Math.max(best, s);
      }
    }
  }
  return best;
}
