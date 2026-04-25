import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { storeCvInCloudinary, type StoredCvAsset } from "../../../lib/cloudinary-storage";
import { scanFileForMalware } from "../../../lib/malware-scan";
import { getRequestIdentity } from "../../../lib/security";
import { logUpload } from "../../../lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE_SIZE = 6 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "rtf"]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a CV file to import." }, { status: 400 });
    }

    return await importCvFile(file, identity);
  } catch (error) {
    console.error("CV import route failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error:
          "The CV import service hit a production error. Please try again, or paste your CV text while we check server logs.",
      },
      { status: 500 },
    );
  }
}

async function importCvFile(
  file: File,
  identity: Awaited<ReturnType<typeof getRequestIdentity>>,
) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (file.size > MAX_FILE_SIZE) {
    await logUpload({
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
      fileName: file.name,
      fileType: file.type,
      extension,
      fileSize: file.size,
      status: "rejected",
      reason: "file_too_large",
    });

    return NextResponse.json(
      { error: "Upload a CV smaller than 6MB, or paste the content manually." },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const validationError = validateFile(file, extension, bytes);

  if (validationError) {
    await logUpload({
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
      fileName: file.name,
      fileType: file.type,
      extension,
      fileSize: file.size,
      status: "rejected",
      reason: validationError,
    });

    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const scan = await safeScanFileForMalware(file);

    if (scan.status === "infected") {
      await logUpload({
        deviceHash: identity.deviceHash,
        ipHash: identity.ipHash,
        fileName: file.name,
        fileType: file.type,
        extension,
        fileSize: file.size,
        status: "rejected",
        reason: "malware_detected",
        scan,
      });

      return NextResponse.json(
        { error: "This file was flagged by malware scanning and cannot be imported." },
        { status: 422 },
      );
    }

    const storage = await safeStoreCvInCloudinary(file, bytes);

    if (file.type === "application/pdf" || extension === "pdf") {
      const text = await extractPdfText(bytes);
      await logAcceptedUpload(identity, file, extension, scan, storage);
      return NextResponse.json({ text });
    }

    if (file.type === DOCX_MIME || extension === "docx") {
      const parsed = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      await logAcceptedUpload(identity, file, extension, scan, storage);
      return NextResponse.json({ text: parsed.value.trim() });
    }

    if (TEXT_EXTENSIONS.has(extension || "")) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
      await logAcceptedUpload(identity, file, extension, scan, storage);
      return NextResponse.json({ text });
    }

    return NextResponse.json(
      { error: "Use PDF, DOCX, TXT, Markdown, or RTF files." },
      { status: 400 },
    );
  } catch (error) {
    console.error("CV import failed", {
      fileName: file.name,
      fileType: file.type,
      extension,
      message: error instanceof Error ? error.message : String(error),
    });

    await logUpload({
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
      fileName: file.name,
      fileType: file.type,
      extension,
      fileSize: file.size,
      status: "rejected",
      reason: error instanceof Error ? error.message : "import_failed",
    });

    return NextResponse.json(
      {
        error:
          extension === "pdf"
            ? "We could not extract text from that PDF. If it is scanned, locked, or image-based, paste the text or export a text-based PDF."
            : "We could not read that Word document. Try saving it again as .docx or PDF, or paste the text.",
      },
      { status: 422 },
    );
  }
}

async function safeScanFileForMalware(file: File) {
  try {
    return await scanFileForMalware(file);
  } catch (error) {
    if (process.env.MALWARE_SCAN_REQUIRED === "true") {
      throw error;
    }

    console.error("Malware scan skipped after error", {
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      provider: "virustotal" as const,
      status: "skipped" as const,
      message: error instanceof Error ? error.message : "VirusTotal scan failed.",
    };
  }
}

async function safeStoreCvInCloudinary(file: File, bytes: Uint8Array) {
  try {
    return await storeCvInCloudinary(file, bytes);
  } catch (error) {
    console.error("Cloudinary CV storage skipped after error", {
      message: error instanceof Error ? error.message : String(error),
    });

    return undefined;
  }
}

function validateFile(file: File, extension: string | undefined, bytes: Uint8Array) {
  if (extension === "doc" || file.type === "application/msword") {
    return "Legacy .doc files are not supported yet. Save the document as .docx or PDF.";
  }

  if (extension === "pdf" || file.type === "application/pdf") {
    return startsWith(bytes, [0x25, 0x50, 0x44, 0x46])
      ? null
      : "That file does not look like a valid PDF.";
  }

  if (extension === "docx" || file.type === DOCX_MIME) {
    return startsWith(bytes, [0x50, 0x4b])
      ? null
      : "That file does not look like a valid DOCX document.";
  }

  if (TEXT_EXTENSIONS.has(extension || "")) {
    return bytes.includes(0)
      ? "That file looks binary. Upload PDF, DOCX, TXT, Markdown, or RTF only."
      : null;
  }

  return "Use PDF, DOCX, TXT, Markdown, or RTF files.";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

async function logAcceptedUpload(
  identity: Awaited<ReturnType<typeof getRequestIdentity>>,
  file: File,
  extension: string | undefined,
  scan: Awaited<ReturnType<typeof scanFileForMalware>>,
  storage?: StoredCvAsset,
) {
  await logUpload({
    deviceHash: identity.deviceHash,
    ipHash: identity.ipHash,
    fileName: file.name,
    fileType: file.type,
    extension,
    fileSize: file.size,
    status: "accepted",
    scan,
    storage,
  });
}

async function extractPdfText(bytes: Uint8Array) {
  const { PDFParse } = await import("pdf-parse");
  let parser: InstanceType<typeof PDFParse> | null = null;

  try {
    PDFParse.setWorker(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/legacy/build/pdf.worker.mjs",
    );
    parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText();
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("No selectable PDF text found.");
    }

    return text;
  } finally {
    await parser?.destroy();
  }
}
