// Skill taxonomy used to recognise skills in resumes and job descriptions and
// to treat aliases ("JS", "javascript", "ECMAScript") as the same skill.
//
// Format: [slug, display name, category, aliases ("|"-separated, matched
// case-insensitively), case-sensitive aliases (for ambiguous words such as
// "Go", "R", "Swift", "Excel")]. The display name is always an alias.

type Entry = [slug: string, name: string, category: string, aliases?: string, caseSensitive?: string];

const ENTRIES: Entry[] = [
  // Programming languages
  ["javascript", "JavaScript", "language", "js|ecmascript|es6"],
  ["typescript", "TypeScript", "language", "ts"],
  ["python", "Python", "language", "python3"],
  ["java", "Java", "language", "java 8|java 11|java 17"],
  ["kotlin", "Kotlin", "language"],
  ["go", "Go", "language", "golang", "Go"],
  ["rust", "Rust", "language", "", "Rust"],
  ["ruby", "Ruby", "language"],
  ["php", "PHP", "language"],
  ["csharp", "C#", "language", "c sharp|csharp"],
  ["cpp", "C++", "language", "cpp|c plus plus"],
  ["c", "C", "language", "", "C/C++|ANSI C|C programming"],
  ["swift", "Swift", "language", "", "Swift|SwiftUI"],
  ["objective-c", "Objective-C", "language", "objective c|objc"],
  ["scala", "Scala", "language"],
  ["elixir", "Elixir", "language"],
  ["erlang", "Erlang", "language"],
  ["haskell", "Haskell", "language"],
  ["clojure", "Clojure", "language"],
  ["dart", "Dart", "language"],
  ["r", "R", "language", "rstudio|tidyverse", "R"],
  ["matlab", "MATLAB", "language"],
  ["sql", "SQL", "language", "t-sql|pl/sql|plsql"],
  ["bash", "Bash", "language", "shell scripting|shell script|zsh"],
  ["solidity", "Solidity", "language"],
  ["lua", "Lua", "language"],
  ["perl", "Perl", "language"],

  // Frontend
  ["react", "React", "frontend", "react.js|reactjs|react js"],
  ["nextjs", "Next.js", "frontend", "nextjs|next js"],
  ["vue", "Vue.js", "frontend", "vue|vuejs|vue 3|nuxt|nuxt.js"],
  ["angular", "Angular", "frontend", "angularjs|angular.js"],
  ["svelte", "Svelte", "frontend", "sveltekit"],
  ["redux", "Redux", "frontend", "redux toolkit"],
  ["html", "HTML", "frontend", "html5"],
  ["css", "CSS", "frontend", "css3|scss|sass|less css"],
  ["tailwind", "Tailwind CSS", "frontend", "tailwind|tailwindcss"],
  ["webpack", "Webpack / Vite", "frontend", "vite|rollup|esbuild"],
  ["graphql", "GraphQL", "backend", "apollo graphql"],
  ["accessibility", "Web accessibility", "frontend", "wcag|a11y|accessibility"],

  // Backend & frameworks
  ["nodejs", "Node.js", "backend", "node|nodejs|node js"],
  ["express", "Express.js", "backend", "expressjs|express js"],
  ["nestjs", "NestJS", "backend", "nest.js"],
  ["django", "Django", "backend"],
  ["flask", "Flask", "backend"],
  ["fastapi", "FastAPI", "backend"],
  ["rails", "Ruby on Rails", "backend", "rails|ror"],
  ["laravel", "Laravel", "backend"],
  ["spring", "Spring Boot", "backend", "spring framework|spring boot|springboot"],
  ["dotnet", ".NET", "backend", "dotnet|asp.net|.net core"],
  ["rest-api", "REST APIs", "backend", "restful|rest api|restful api|restful apis|rest apis"],
  ["grpc", "gRPC", "backend"],
  ["microservices", "Microservices", "backend", "microservice|service-oriented architecture|soa"],
  ["distributed-systems", "Distributed systems", "backend", "distributed system"],
  ["system-design", "System design", "backend", "systems design|software architecture"],
  ["websockets", "WebSockets", "backend", "websocket|socket.io"],
  ["kafka", "Kafka", "backend", "apache kafka"],
  ["rabbitmq", "RabbitMQ", "backend"],
  ["redis", "Redis", "database"],
  ["supabase", "Supabase", "backend"],
  ["firebase", "Firebase", "backend", "firestore"],
  ["wordpress", "WordPress", "backend", "woocommerce"],
  ["shopify", "Shopify", "backend", "liquid"],

  // Mobile
  ["react-native", "React Native", "mobile", "react-native"],
  ["flutter", "Flutter", "mobile"],
  ["ios", "iOS development", "mobile", "ios", "UIKit|Xcode"],
  ["android", "Android development", "mobile", "android", "Jetpack Compose"],

  // Databases
  ["postgresql", "PostgreSQL", "database", "postgres|psql"],
  ["mysql", "MySQL", "database", "mariadb"],
  ["mongodb", "MongoDB", "database", "mongo|mongoose"],
  ["sqlite", "SQLite", "database"],
  ["dynamodb", "DynamoDB", "database"],
  ["elasticsearch", "Elasticsearch", "database", "elastic search|opensearch"],
  ["cassandra", "Cassandra", "database"],
  ["snowflake", "Snowflake", "data"],
  ["bigquery", "BigQuery", "data", "big query"],
  ["redshift", "Redshift", "data"],
  ["clickhouse", "ClickHouse", "database"],

  // Cloud & DevOps
  ["aws", "AWS", "cloud", "amazon web services|ec2|s3|lambda|aws lambda"],
  ["gcp", "Google Cloud", "cloud", "gcp|google cloud platform"],
  ["azure", "Azure", "cloud", "microsoft azure"],
  ["cloudflare", "Cloudflare", "cloud", "cloudflare workers"],
  ["docker", "Docker", "devops", "containers|containerization"],
  ["kubernetes", "Kubernetes", "devops", "k8s|helm|eks|gke|aks"],
  ["terraform", "Terraform", "devops", "infrastructure as code|iac|pulumi"],
  ["ansible", "Ansible", "devops"],
  ["ci-cd", "CI/CD", "devops", "ci/cd|continuous integration|continuous delivery|continuous deployment|github actions|gitlab ci|jenkins|circleci"],
  ["linux", "Linux", "devops", "unix|ubuntu|debian"],
  ["observability", "Observability", "devops", "monitoring|prometheus|grafana|datadog|opentelemetry|new relic"],
  ["sre", "Site reliability engineering", "devops", "sre|site reliability"],
  ["networking", "Networking", "devops", "tcp/ip|dns|load balancing|vpn"],
  ["git", "Git", "devops", "github|gitlab|version control|bitbucket"],
  ["serverless", "Serverless", "cloud"],
  ["vercel", "Vercel", "cloud"],
  ["netlify", "Netlify", "cloud"],

  // Security
  ["security", "Application security", "security", "appsec|application security|owasp|secure coding"],
  ["iam", "Identity & access management", "security", "iam|oauth|oauth2|openid connect|oidc|saml|sso"],
  ["penetration-testing", "Penetration testing", "security", "pentesting|pen testing|penetration testing"],
  ["soc2", "SOC 2", "security", "soc 2|soc2|iso 27001|iso27001"],
  ["cloud-security", "Cloud security", "security"],

  // Testing & quality
  ["testing", "Automated testing", "testing", "unit testing|integration testing|test automation|tdd|automated testing"],
  ["jest", "Jest", "testing", "vitest|mocha"],
  ["cypress", "Cypress", "testing", "playwright|selenium"],
  ["qa", "Quality assurance", "testing", "qa|quality assurance|manual testing"],

  // Data & analytics
  ["data-analysis", "Data analysis", "data", "data analysis|data analytics|analytics"],
  ["excel", "Excel", "data", "microsoft excel|spreadsheets|google sheets", "Excel"],
  ["tableau", "Tableau", "data"],
  ["power-bi", "Power BI", "data", "powerbi"],
  ["looker", "Looker", "data", "looker studio"],
  ["pandas", "pandas", "data", "numpy"],
  ["spark", "Apache Spark", "data", "pyspark|spark", "Spark"],
  ["airflow", "Airflow", "data", "apache airflow|dagster|prefect"],
  ["dbt", "dbt", "data", "data build tool"],
  ["etl", "ETL", "data", "elt|etl pipelines|data pipelines|data pipeline"],
  ["data-engineering", "Data engineering", "data", "data engineering|data warehouse|data warehousing|data modeling|data modelling"],
  ["statistics", "Statistics", "data", "statistical analysis|statistical modeling|a/b testing|ab testing|experimentation"],

  // AI / ML
  ["machine-learning", "Machine learning", "ai", "ml|machine learning"],
  ["deep-learning", "Deep learning", "ai", "neural networks"],
  ["pytorch", "PyTorch", "ai", "torch"],
  ["tensorflow", "TensorFlow", "ai", "keras"],
  ["scikit-learn", "scikit-learn", "ai", "sklearn"],
  ["nlp", "NLP", "ai", "natural language processing"],
  ["computer-vision", "Computer vision", "ai", "opencv"],
  ["llm", "LLMs", "ai", "llm|llms|large language models|large language model|generative ai|genai|gpt|prompt engineering|rag|retrieval augmented generation"],
  ["mlops", "MLOps", "ai", "model deployment"],

  // Design
  ["figma", "Figma", "design"],
  ["ui-design", "UI design", "design", "ui design|user interface design|visual design|interface design"],
  ["ux-design", "UX design", "design", "ux|user experience design|ux design|interaction design|ux research|user research|usability testing"],
  ["product-design", "Product design", "design"],
  ["design-systems", "Design systems", "design", "design system"],
  ["prototyping", "Prototyping", "design", "wireframing|wireframes|prototypes"],
  ["adobe-creative-suite", "Adobe Creative Suite", "design", "photoshop|illustrator|indesign|after effects|premiere pro|adobe xd"],
  ["graphic-design", "Graphic design", "design", "brand design|brand identity"],
  ["motion-design", "Motion design", "design", "motion graphics|animation"],

  // Product & project
  ["product-management", "Product management", "product", "product management|product manager|product roadmap|roadmapping"],
  ["agile", "Agile", "product", "scrum|kanban|sprint planning"],
  ["project-management", "Project management", "operations", "project management|pmp|program management"],
  ["jira", "Jira", "product", "confluence|linear app"],
  ["stakeholder-management", "Stakeholder management", "product", "stakeholder management|cross-functional collaboration|cross-functional teams"],

  // Marketing
  ["digital-marketing", "Digital marketing", "marketing", "online marketing|growth marketing|performance marketing"],
  ["seo", "SEO", "marketing", "search engine optimization|search engine optimisation"],
  ["sem", "SEM / paid search", "marketing", "sem|ppc|google ads|paid search|paid media"],
  ["social-media", "Social media marketing", "marketing", "social media|meta ads|facebook ads|tiktok ads|instagram marketing|community management"],
  ["content-marketing", "Content marketing", "marketing", "content strategy|content marketing"],
  ["email-marketing", "Email marketing", "marketing", "email marketing|lifecycle marketing|klaviyo|mailchimp|braze|customer.io"],
  ["marketing-analytics", "Marketing analytics", "marketing", "google analytics|ga4|mixpanel|amplitude|attribution"],
  ["hubspot", "HubSpot", "marketing", "marketo"],
  ["product-marketing", "Product marketing", "marketing", "go-to-market|gtm strategy|product positioning"],

  // Sales & customer
  ["sales", "B2B sales", "sales", "b2b sales|saas sales|enterprise sales|closing deals|quota attainment|full-cycle sales|full cycle sales"],
  ["business-development", "Business development", "sales", "business development|partnerships|lead generation|prospecting|outbound"],
  ["account-management", "Account management", "sales", "account management|account manager|client relationship"],
  ["salesforce", "Salesforce", "sales", "sfdc"],
  ["crm", "CRM", "sales", "crm|pipedrive|zoho crm"],
  ["customer-success", "Customer success", "customer", "customer success|onboarding customers|client success|churn reduction"],
  ["customer-support", "Customer support", "customer", "customer support|customer service|technical support|help desk|helpdesk|zendesk|intercom|freshdesk"],
  ["negotiation", "Negotiation", "sales"],

  // Finance & ops
  ["accounting", "Accounting", "finance", "bookkeeping|general ledger|accounts payable|accounts receivable|reconciliation|gaap|ifrs"],
  ["financial-modeling", "Financial modeling", "finance", "financial modelling|financial analysis|fp&a|forecasting|budgeting"],
  ["quickbooks", "QuickBooks", "finance", "xero|netsuite"],
  ["payroll", "Payroll", "finance"],
  ["tax", "Tax accounting", "finance", "tax compliance|taxation|tax returns|vat returns"],
  ["audit", "Financial audit", "finance", "internal audit|external audit|audit and assurance"],
  ["compliance", "Regulatory compliance", "finance", "kyc|aml|anti-money laundering|compliance monitoring"],
  ["operations", "Business operations", "operations", "business operations|operations management|process improvement"],
  ["supply-chain", "Supply chain", "operations", "logistics|procurement|inventory management"],

  // People
  ["recruiting", "Recruiting", "people", "talent acquisition|sourcing candidates|technical recruiting|full-cycle recruiting|recruiting experience"],
  ["hr", "Human resources", "people", "hr|human resources|people operations|hris|employee relations"],

  // Writing & content
  ["copywriting", "Copywriting", "writing", "copy writing|copywriter"],
  ["technical-writing", "Technical writing", "writing", "technical documentation|api documentation|docs-as-code"],
  ["content-writing", "Content writing", "writing", "blog writing|editorial|proofreading|content writing"],
  ["translation", "Translation", "writing", "localization|localisation"],
  ["video-editing", "Video editing", "writing", "premiere|final cut|davinci resolve"],

  // Web3
  ["blockchain", "Blockchain", "web3", "web3|ethereum|smart contracts|defi"],

  // Misc tools
  ["notion", "Notion", "tools"],
  ["zapier", "Zapier", "tools", "make.com|n8n|workflow automation"],
];

export interface Skill {
  slug: string;
  name: string;
  category: string;
  aliases: string[];
  caseSensitive: string[];
}

export const SKILLS: Skill[] = ENTRIES.map(([slug, name, category, aliases = "", cs = ""]) => ({
  slug,
  name,
  category,
  aliases: Array.from(new Set([name.toLowerCase(), ...aliases.split("|").map((a) => a.trim().toLowerCase())].filter(Boolean))),
  caseSensitive: cs.split("|").filter(Boolean),
}));

export const SKILL_BY_SLUG = new Map(SKILLS.map((s) => [s.slug, s]));

// Some names are ambiguous English words when matched case-insensitively.
// Those are only matched via their case-sensitive variants.
const CASE_SENSITIVE_ONLY = new Set(["go", "r", "c", "swift", "rust", "excel", "spark"]);

const BOUNDARY_BEFORE = "(?<![A-Za-z0-9+#])";
const BOUNDARY_AFTER = "(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])";

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+").replace(/ /g, "\\s+");
}

interface CompiledSkill {
  skill: Skill;
  ci: RegExp | null;
  cs: RegExp | null;
}

const COMPILED: CompiledSkill[] = SKILLS.map((skill) => {
  const ciAliases = skill.aliases.filter((a) => !CASE_SENSITIVE_ONLY.has(a) && a.length > 1);
  const ci = ciAliases.length
    ? new RegExp(`${BOUNDARY_BEFORE}(?:${ciAliases.sort((a, b) => b.length - a.length).map(esc).join("|")})${BOUNDARY_AFTER}`, "i")
    : null;
  const cs = skill.caseSensitive.length
    ? new RegExp(`${BOUNDARY_BEFORE}(?:${skill.caseSensitive.map(esc).join("|")})${BOUNDARY_AFTER}`)
    : null;
  return { skill, ci, cs };
});

/** Extra guards for case-sensitive single words that are also common English. */
function falsePositive(slug: string, text: string, index: number, match: string): boolean {
  const after = text.slice(index + match.length, index + match.length + 12);
  const before = text.slice(Math.max(0, index - 3), index);
  if (slug === "go") {
    // "Go to market", "Go-to-market", "Go live", sentence-initial "Go ..."
    if (/^[\s-]*(to|live|ahead|beyond|above|-to)\b/i.test(after)) return true;
    if (/(^|[.!?]\s*)$/.test(before) && !/^\s*[,/)]/.test(after)) return true;
  }
  if (slug === "r") {
    if (/^\s*&\s*D/i.test(after) || /^&/.test(after)) return true; // R&D
    if (/^\.\s*[A-Z]/.test(after)) return true; // initials "R. Smith"
  }
  if (slug === "c" && /^\s*-?\s*(level|suite)/i.test(after)) return true;
  return false;
}

/** Return slugs of all taxonomy skills mentioned in the text. */
export function findSkills(text: string): string[] {
  const found: string[] = [];
  for (const { skill, ci, cs } of COMPILED) {
    let hit = false;
    if (ci && ci.test(text)) hit = true;
    if (!hit && cs) {
      const re = new RegExp(cs.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (!falsePositive(skill.slug, text, m.index, m[0])) {
          hit = true;
          break;
        }
      }
    }
    if (hit) found.push(skill.slug);
  }
  // "Java" must not be implied by "JavaScript"; regex boundaries already handle
  // this. React Native implies React-family knowledge but we keep them separate.
  return found;
}

/** Map a free-text skill name (from a resume or the user) to a taxonomy slug, or a slugified fallback. */
export function normalizeSkillName(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const s of SKILLS) {
    if (s.aliases.includes(lower) || s.caseSensitive.some((c) => c.toLowerCase() === lower)) return s.slug;
  }
  const found = findSkills(name);
  if (found.length === 1 && name.length <= 40) return found[0];
  return lower.replace(/[^a-z0-9+#]+/g, "-").replace(/^-+|-+$/g, "");
}

export function skillDisplayName(slug: string): string {
  return SKILL_BY_SLUG.get(slug)?.name ?? slug.replace(/-/g, " ");
}

/**
 * Closely related skills that count as partial evidence for each other
 * (e.g. a Next.js developer clearly knows React).
 */
export const IMPLIES: Record<string, string[]> = {
  nextjs: ["react", "javascript"],
  react: ["javascript", "html"],
  "react-native": ["react", "javascript"],
  typescript: ["javascript"],
  vue: ["javascript"],
  angular: ["typescript", "javascript"],
  svelte: ["javascript"],
  nestjs: ["nodejs", "typescript"],
  express: ["nodejs", "javascript"],
  nodejs: ["javascript"],
  django: ["python"],
  flask: ["python"],
  fastapi: ["python"],
  pandas: ["python"],
  pytorch: ["python", "machine-learning"],
  tensorflow: ["python", "machine-learning"],
  "scikit-learn": ["python", "machine-learning"],
  rails: ["ruby"],
  laravel: ["php"],
  spring: ["java"],
  dotnet: ["csharp"],
  kubernetes: ["docker"],
  postgresql: ["sql"],
  mysql: ["sql"],
  bigquery: ["sql"],
  snowflake: ["sql"],
  redshift: ["sql"],
  dbt: ["sql", "etl"],
  tailwind: ["css", "html"],
  css: ["html"],
  flutter: ["dart"],
  supabase: ["postgresql"],
};
