// Turn an uploaded resume file into plain text. Works in Node and Workers.

export const RESUME_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export type ResumeKind = keyof typeof RESUME_MIME;

/** Detect the real file type from its first bytes (never trust the extension alone). */
export function sniffResumeKind(bytes: Uint8Array): ResumeKind | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "pdf"; // %PDF-
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx"; // PK zip
  return null;
}

export class ResumeFileError extends Error {}

export function validateResumeFile(name: string, size: number, bytes: Uint8Array): ResumeKind {
  if (size <= 0) throw new ResumeFileError("The file is empty.");
  if (size > MAX_RESUME_BYTES) throw new ResumeFileError("The file is larger than 5 MB.");
  const kind = sniffResumeKind(bytes);
  if (!kind) throw new ResumeFileError("Please upload a PDF or Word (.docx) file.");
  const ext = name.toLowerCase().split(".").pop();
  if (kind === "docx" && ext !== "docx") throw new ResumeFileError("Please upload a PDF or Word (.docx) file.");
  return kind;
}

export async function extractResumeText(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  let text: string;
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } else {
    const mammoth = await import("mammoth");
    const extract = (mammoth as unknown as { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText
      ?? (mammoth as unknown as { default: { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> } }).default.extractRawText;
    const result = await extract({ buffer: Buffer.from(bytes) });
    text = result.value;
  }
  text = text
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 80) {
    throw new ResumeFileError(
      "We couldn't read text from this file. If it's a scanned image, please upload a text-based PDF or a Word document.",
    );
  }
  return text.slice(0, 60_000);
}
