import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/** Turns plain text (as edited by the user) into a clean Word document. */
export async function textToDocx(text: string, opts: { kind: "resume" | "letter" }): Promise<Uint8Array> {
  const lines = text.replace(/\r/g, "").split("\n");
  const paragraphs: Paragraph[] = [];
  lines.forEach((line, i) => {
    const t = line.trimEnd();
    if (opts.kind === "resume" && i === 0 && t) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: t, bold: true, size: 36 })] }));
      return;
    }
    if (opts.kind === "resume" && /^[A-Z][A-Z &]{2,}$/.test(t)) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 24 })] }));
      return;
    }
    if (/^[•\-*]\s+/.test(t)) {
      paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: t.replace(/^[•\-*]\s+/, ""), size: 21 })] }));
      return;
    }
    const isRoleLine = opts.kind === "resume" && t.includes(" | ");
    paragraphs.push(new Paragraph({ spacing: { after: opts.kind === "letter" ? 120 : 40 }, children: [new TextRun({ text: t, bold: isRoleLine, size: 21 })] }));
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: paragraphs }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
