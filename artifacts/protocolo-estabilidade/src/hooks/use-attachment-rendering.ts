import { useState, useEffect } from "react";

type Attachment = {
  id: number;
  fileType: string;
  objectPath: string;
};

export type AttachmentRenderingResult = {
  imageUrls: Record<number, string>;
  pdfPages: Record<number, string[]>;
  wordHtml: Record<number, string>;
};

let workerSrcSet = false;

async function pdfToImages(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  if (!workerSrcSet) {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).href;
    workerSrcSet = true;
  }
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return pages;
}

async function wordToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAttachmentRendering(
  attachments: Attachment[],
  enabled = true
): AttachmentRenderingResult {
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [pdfPages, setPdfPages] = useState<Record<number, string[]>>({});
  const [wordHtml, setWordHtml] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!enabled || attachments.length === 0) {
      setImageUrls({});
      setPdfPages({});
      setWordHtml({});
      return;
    }
    const token = localStorage.getItem("alphafitus_token");
    let cancelled = false;

    (async () => {
      const imgs: Record<number, string> = {};
      const pdfs: Record<number, string[]> = {};
      const words: Record<number, string> = {};

      for (const att of attachments) {
        if (cancelled) break;
        try {
          const r = await fetch(`/api/storage${att.objectPath}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!r.ok || cancelled) continue;
          const arrayBuffer = await r.arrayBuffer();
          if (cancelled) continue;

          if (att.fileType.startsWith("image/")) {
            const blob = new Blob([arrayBuffer], { type: att.fileType });
            imgs[att.id] = await blobToDataUrl(blob);
          } else if (att.fileType === "application/pdf") {
            pdfs[att.id] = await pdfToImages(arrayBuffer);
          } else if (
            att.fileType.includes("word") ||
            att.fileType.includes("officedocument.wordprocessingml")
          ) {
            words[att.id] = await wordToHtml(arrayBuffer);
          }
        } catch {
          /* ignore individual fetch/conversion errors */
        }
      }

      if (!cancelled) {
        setImageUrls(imgs);
        setPdfPages(pdfs);
        setWordHtml(words);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachments, enabled]);

  return { imageUrls, pdfPages, wordHtml };
}
