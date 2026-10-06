import type { Provenance } from "@/lib/types";
import { Tag } from "./ui";

/** Shows where a profile fact came from, so extracted facts and inferences are never confused. */
export function ProvenanceTag({ provenance, evidence }: { provenance: Provenance | null | undefined; evidence?: string | null }) {
  if (provenance === "extracted") return <Tag tone="neutral" title={evidence ? `From your resume: “${evidence}”` : "Found in your resume"}>From resume</Tag>;
  if (provenance === "inferred") return <Tag tone="possible" title={evidence ?? "We worked this out. Please check it."}>Inferred: please check</Tag>;
  if (provenance === "user") return <Tag tone="strong">Added by you</Tag>;
  return null;
}
