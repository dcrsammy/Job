/** Renders plain-text job descriptions with headings, paragraphs and lists. */
export function JobDescription({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
          {list.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[-•*▪●]\s+/.test(line)) {
      list.push(line.replace(/^[-•*▪●]\s+/, ""));
      continue;
    }
    flush();
    const isHeading = line.length < 70 && !/[.!?,;]$/.test(line) && line.split(" ").length <= 9;
    blocks.push(
      isHeading ? (
        <h3 key={`h${blocks.length}`} className="mt-5 mb-1 font-semibold">{line}</h3>
      ) : (
        <p key={`p${blocks.length}`} className="my-2">{line}</p>
      ),
    );
  }
  flush();
  return <div className="prose-job text-[15px] leading-relaxed text-ink-2">{blocks}</div>;
}
