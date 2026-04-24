/**
 * Extract plain text from a PDF file in the browser using pdfjs-dist.
 * Items are grouped into rows by Y coordinate so that table layouts (such as
 * the Service Canada SOC earnings table) survive the conversion well enough
 * for the SOC parser to recover (year, earnings) pairs.
 *
 * pdfjs-dist (~500KB) is loaded lazily on first call so the initial bundle
 * stays small for users who never import a PDF.
 */

interface PositionedItem {
  str: string;
  x: number;
  y: number;
}

const ROW_TOLERANCE = 3;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjsLib, workerModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items: PositionedItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = (item.str as string).trim();
      if (!str) continue;
      const transform = (item as { transform?: number[] }).transform;
      const x = transform?.[4] ?? 0;
      const y = transform?.[5] ?? 0;
      items.push({ str, x, y });
    }

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    let currentY: number | null = null;
    let currentRow: PositionedItem[] = [];
    const rows: PositionedItem[][] = [];
    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= ROW_TOLERANCE) {
        currentRow.push(item);
        if (currentY === null) currentY = item.y;
      } else {
        rows.push(currentRow);
        currentRow = [item];
        currentY = item.y;
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      lines.push(row.map((i) => i.str).join("\t"));
    }

    if (pageNum < pdf.numPages) lines.push("");
  }

  return lines.join("\n");
}
