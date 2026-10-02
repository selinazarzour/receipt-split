"use client";

type PdfTextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

export async function readReceiptFile(file: File, progress: (message: string) => void): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    progress("Reading the PDF…");
    // Some WebViews do not yet implement this Uint8Array method used by PDF.js.
    const bytes = Uint8Array.prototype as Uint8Array & { toHex?: () => string };
    if (!bytes.toHex) bytes.toHex = function () { return Array.from(this as Uint8Array, (n) => n.toString(16).padStart(2, "0")).join(""); };
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const elements = content.items.filter((x): x is typeof x & PdfTextItem => "str" in x && "transform" in x);
      const rows: Array<{ y: number; parts: Array<{ x: number; width: number; str: string }> }> = [];
      for (const item of elements) {
        if (!item.str.trim()) continue;
        const y = item.transform[5];
        let row = rows.find((r) => Math.abs(r.y - y) < 2.2);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x: item.transform[4], width: item.width, str: item.str });
      }
      const text = rows.sort((a, b) => b.y - a.y)
        .map((r) => {
          const parts = r.parts.sort((a, b) => a.x - b.x);
          return parts.reduce((line, part, index) => {
            const previous = parts[index - 1];
            const gap = previous ? part.x - previous.x - previous.width : 0;
            return line + (index && gap > 2 ? " " : "") + part.str;
          }, "");
        }).join("\n");
      if (text.replace(/\s/g, "").length < 30) {
        progress(`Recognizing scanned page ${pageNumber} of ${pdf.numPages}…`);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        pages.push(await recognize(canvas, progress));
      } else pages.push(text);
    }
    return pages.join("\n");
  }
  if (file.type.startsWith("image/")) return recognize(file, progress);
  throw new Error("Please upload a PDF, JPG, PNG, or WebP image.");
}

async function recognize(file: File | HTMLCanvasElement, progress: (message: string) => void) {
  progress("Reading the receipt image… this may take a minute.");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/tesseract-core-lstm.wasm.js",
    langPath: "/ocr", gzip: false,
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally { await worker.terminate(); }
}
