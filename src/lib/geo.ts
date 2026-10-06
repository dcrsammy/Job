// Country / region recognition for job locations and candidate eligibility.
import type { RemoteType } from "./types";

// ISO 3166-1 alpha-2 -> names and aliases (lowercase).
const COUNTRIES: Record<string, string[]> = {
  US: ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."],
  CA: ["canada"],
  MX: ["mexico"],
  BR: ["brazil", "brasil"],
  AR: ["argentina"],
  CL: ["chile"],
  CO: ["colombia"],
  PE: ["peru"],
  UY: ["uruguay"],
  CR: ["costa rica"],
  GB: ["united kingdom", "uk", "u.k.", "great britain", "england", "scotland", "wales", "northern ireland", "britain"],
  IE: ["ireland"],
  FR: ["france"],
  DE: ["germany", "deutschland"],
  NL: ["netherlands", "the netherlands", "holland"],
  BE: ["belgium"],
  LU: ["luxembourg"],
  ES: ["spain", "españa"],
  PT: ["portugal"],
  IT: ["italy"],
  CH: ["switzerland"],
  AT: ["austria"],
  SE: ["sweden"],
  NO: ["norway"],
  DK: ["denmark"],
  FI: ["finland"],
  IS: ["iceland"],
  PL: ["poland"],
  CZ: ["czech republic", "czechia"],
  SK: ["slovakia"],
  HU: ["hungary"],
  RO: ["romania"],
  BG: ["bulgaria"],
  GR: ["greece"],
  HR: ["croatia"],
  SI: ["slovenia"],
  RS: ["serbia"],
  UA: ["ukraine"],
  EE: ["estonia"],
  LV: ["latvia"],
  LT: ["lithuania"],
  CY: ["cyprus"],
  MT: ["malta"],
  TR: ["turkey", "türkiye"],
  IL: ["israel"],
  AE: ["united arab emirates", "uae", "dubai", "abu dhabi"],
  SA: ["saudi arabia", "ksa"],
  QA: ["qatar"],
  EG: ["egypt"],
  MA: ["morocco"],
  TN: ["tunisia"],
  NG: ["nigeria"],
  GH: ["ghana"],
  KE: ["kenya"],
  ZA: ["south africa"],
  RW: ["rwanda"],
  UG: ["uganda"],
  TZ: ["tanzania"],
  ET: ["ethiopia"],
  SN: ["senegal"],
  CI: ["ivory coast", "côte d'ivoire", "cote d'ivoire"],
  CM: ["cameroon"],
  ZM: ["zambia"],
  ZW: ["zimbabwe"],
  IN: ["india"],
  PK: ["pakistan"],
  BD: ["bangladesh"],
  LK: ["sri lanka"],
  NP: ["nepal"],
  CN: ["china", "mainland china"],
  HK: ["hong kong"],
  TW: ["taiwan"],
  JP: ["japan"],
  KR: ["south korea", "korea", "republic of korea"],
  SG: ["singapore"],
  MY: ["malaysia"],
  ID: ["indonesia"],
  TH: ["thailand"],
  VN: ["vietnam", "viet nam"],
  PH: ["philippines"],
  AU: ["australia"],
  NZ: ["new zealand"],
};

const CITIES: Record<string, string> = {
  "san francisco": "US", "new york": "US", nyc: "US", seattle: "US", austin: "US", boston: "US",
  chicago: "US", "los angeles": "US", denver: "US", atlanta: "US", miami: "US", "washington, dc": "US",
  "washington dc": "US", "san jose": "US", "palo alto": "US", "mountain view": "US", "menlo park": "US",
  "redmond": "US", portland: "US", "salt lake city": "US", dallas: "US", houston: "US", phoenix: "US",
  philadelphia: "US", pittsburgh: "US", "san diego": "US", "sunnyvale": "US", "bay area": "US",
  london: "GB", manchester: "GB", edinburgh: "GB", cambridge: "GB", bristol: "GB",
  dublin: "IE", berlin: "DE", munich: "DE", münchen: "DE", hamburg: "DE", frankfurt: "DE", cologne: "DE",
  stuttgart: "DE", paris: "FR", amsterdam: "NL", rotterdam: "NL", brussels: "BE", madrid: "ES",
  barcelona: "ES", lisbon: "PT", porto: "PT", milan: "IT", rome: "IT", zurich: "CH", zürich: "CH",
  geneva: "CH", vienna: "AT", stockholm: "SE", oslo: "NO", copenhagen: "DK", helsinki: "FI",
  warsaw: "PL", krakow: "PL", kraków: "PL", prague: "CZ", budapest: "HU", bucharest: "RO",
  athens: "GR", tallinn: "EE", "tel aviv": "IL", istanbul: "TR",
  toronto: "CA", vancouver: "CA", montreal: "CA", ottawa: "CA", calgary: "CA",
  "mexico city": "MX", "são paulo": "BR", "sao paulo": "BR", "buenos aires": "AR", bogota: "CO", bogotá: "CO",
  santiago: "CL", lagos: "NG", abuja: "NG", nairobi: "KE", accra: "GH", "cape town": "ZA",
  johannesburg: "ZA", cairo: "EG", kigali: "RW",
  bangalore: "IN", bengaluru: "IN", hyderabad: "IN", mumbai: "IN", pune: "IN", delhi: "IN",
  "new delhi": "IN", gurgaon: "IN", gurugram: "IN", chennai: "IN", noida: "IN",
  singapore: "SG", tokyo: "JP", seoul: "KR", "hong kong": "HK", shanghai: "CN", beijing: "CN",
  shenzhen: "CN", taipei: "TW", sydney: "AU", melbourne: "AU", brisbane: "AU", auckland: "NZ",
  "kuala lumpur": "MY", jakarta: "ID", manila: "PH", bangkok: "TH",
};

const US_STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
const CA_PROVINCES = "ON BC QC AB MB SK NS NB NL PE".split(" ");

const EUROPE = "GB IE FR DE NL BE LU ES PT IT CH AT SE NO DK FI IS PL CZ SK HU RO BG GR HR SI RS UA EE LV LT CY MT".split(" ");
const EU = "IE FR DE NL BE LU ES PT IT AT SE DK FI PL CZ SK HU RO BG GR HR SI EE LV LT CY MT".split(" ");
const AFRICA = "EG MA TN NG GH KE ZA RW UG TZ ET SN CI CM ZM ZW".split(" ");
const MIDDLE_EAST = "IL AE SA QA TR".split(" ");
const LATAM = "MX BR AR CL CO PE UY CR".split(" ");
const APAC = "IN PK BD LK NP CN HK TW JP KR SG MY ID TH VN PH AU NZ".split(" ");

export const REGIONS: Record<string, { label: string; countries: string[] | "*" }> = {
  WORLDWIDE: { label: "Worldwide", countries: "*" },
  EMEA: { label: "EMEA", countries: [...EUROPE, ...MIDDLE_EAST, ...AFRICA] },
  EUROPE: { label: "Europe", countries: EUROPE },
  EU: { label: "European Union", countries: EU },
  AFRICA: { label: "Africa", countries: AFRICA },
  MENA: { label: "Middle East & North Africa", countries: [...MIDDLE_EAST, "EG", "MA", "TN"] },
  LATAM: { label: "Latin America", countries: LATAM },
  NORTH_AMERICA: { label: "North America", countries: ["US", "CA", "MX"] },
  AMERICAS: { label: "Americas", countries: ["US", "CA", ...LATAM] },
  APAC: { label: "Asia-Pacific", countries: APAC },
};

const REGION_PATTERNS: [RegExp, string][] = [
  [/\b(worldwide|anywhere|global(ly)?|international|any location|all locations|work from anywhere)\b/i, "WORLDWIDE"],
  [/\bemea\b/i, "EMEA"],
  [/\b(european union|\beu\b)/i, "EU"],
  [/\beurope(an)?\b/i, "EUROPE"],
  [/\bafrica\b/i, "AFRICA"],
  [/\bmena\b/i, "MENA"],
  [/\b(latam|latin america|south america)\b/i, "LATAM"],
  [/\b(north america|namer|noram)\b/i, "NORTH_AMERICA"],
  [/\b(americas|amer)\b/i, "AMERICAS"],
  [/\b(apac|asia[- ]pacific|asia)\b/i, "APAC"],
];

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRIES).map(([code, names]) => [
    code,
    names[0].replace(/\b\w/g, (c) => c.toUpperCase()).replace("Of", "of"),
  ]),
);
COUNTRY_NAMES.US = "United States";
COUNTRY_NAMES.GB = "United Kingdom";
COUNTRY_NAMES.AE = "United Arab Emirates";

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? REGIONS[code]?.label ?? code;
}

const COUNTRY_MATCHERS: [RegExp, string][] = Object.entries(COUNTRIES).flatMap(([code, names]) =>
  names.map((n): [RegExp, string] => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Short codes like "US"/"UK" must be upper-case to avoid matching "us" the pronoun.
    if (n.length <= 4 && /^[a-z.]+$/.test(n)) {
      return [new RegExp(`(?<![A-Za-z])${escaped.toUpperCase()}(?![A-Za-z])`), code];
    }
    return [new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i"), code];
  }),
);

/** Find ISO country codes mentioned in free text. */
export function findCountries(text: string): string[] {
  const out = new Set<string>();
  for (const [re, code] of COUNTRY_MATCHERS) if (re.test(text)) out.add(code);
  const lower = text.toLowerCase();
  for (const [city, code] of Object.entries(CITIES)) {
    if (new RegExp(`(?<![a-z])${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(lower)) out.add(code);
  }
  const stateMatch = text.match(/,\s*([A-Z]{2})\b/g) ?? [];
  for (const m of stateMatch) {
    const abbr = m.replace(/[,\s]/g, "");
    if (US_STATES.includes(abbr)) out.add("US");
    else if (CA_PROVINCES.includes(abbr)) out.add("CA");
  }
  // "Georgia" is ambiguous (US state vs country) and "Jersey" etc. are skipped deliberately.
  return [...out];
}

export function findRegions(text: string): string[] {
  const out = new Set<string>();
  for (const [re, code] of REGION_PATTERNS) if (re.test(text)) out.add(code);
  // EU check above can over-trigger on "Europe"; keep the more specific.
  return [...out];
}

export function countryInRegion(country: string, region: string): boolean {
  if (region === country) return true;
  const r = REGIONS[region];
  if (!r) return false;
  return r.countries === "*" || r.countries.includes(country);
}

export interface ParsedLocation {
  remoteType: RemoteType;
  countries: string[];
  regions: string[];
  /** Where remote work is allowed: region codes and/or country codes. Empty = not stated. */
  remoteRegions: string[];
}

/** Interpret location strings such as "Remote - US", "Hybrid, London" or "Remote (EMEA)". */
export function parseLocation(parts: (string | null | undefined)[], remoteHint?: RemoteType | null): ParsedLocation {
  const text = parts.filter(Boolean).join(" | ");
  const countries = findCountries(text);
  const regions = findRegions(text);
  let remoteType: RemoteType = remoteHint ?? "unknown";
  if (remoteType === "unknown") {
    if (/\bhybrid\b/i.test(text)) remoteType = "hybrid";
    else if (/\b(remote|anywhere|worldwide|work from home|wfh|distributed|home[- ]based)\b/i.test(text)) remoteType = "remote";
    else if (/\b(on-?site|in[- ]office|office-based)\b/i.test(text) || countries.length > 0) remoteType = "onsite";
  }

  // A location that names only a region ("AMER", "EMEA") with no city or country
  // means the role is distributed within that region.
  if (remoteType === "unknown" && countries.length === 0 && regions.length > 0) remoteType = "remote";

  let remoteRegions: string[] = [];
  if (remoteType === "remote") {
    if (regions.includes("WORLDWIDE") && countries.length === 0) remoteRegions = ["WORLDWIDE"];
    else remoteRegions = [...regions.filter((r) => r !== "WORLDWIDE"), ...countries];
  }
  return { remoteType, countries, regions, remoteRegions };
}

/** Can someone based in / authorised for these countries take a remote job limited to these regions? */
export function remoteEligibility(
  remoteRegions: string[],
  candidateCountries: string[],
): "eligible" | "ineligible" | "unknown" {
  if (remoteRegions.length === 0) return "unknown";
  if (candidateCountries.length === 0) return "unknown";
  for (const region of remoteRegions) {
    for (const c of candidateCountries) if (countryInRegion(c, region)) return "eligible";
  }
  return "ineligible";
}

export const COUNTRY_OPTIONS = Object.keys(COUNTRIES)
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
