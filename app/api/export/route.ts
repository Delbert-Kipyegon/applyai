import { NextResponse } from "next/server";
import {
  buildDocx,
  buildExportFilename,
  buildPdf,
  type ExportDocumentType,
  type ExportFormat,
} from "../../../lib/document-export";

type ExportRequest = {
  content?: string;
  documentType?: ExportDocumentType;
  format?: ExportFormat;
  jobTitle?: string;
  company?: string;
  applicantName?: string;
  accentColor?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ExportRequest;

  if (!body.content || !body.documentType || !body.format) {
    return NextResponse.json({ error: "Content, document type, and format are required." }, { status: 400 });
  }

  if (!["cv", "cover"].includes(body.documentType) || !["pdf", "docx"].includes(body.format)) {
    return NextResponse.json({ error: "Unsupported export request." }, { status: 400 });
  }

  const input = {
    content: body.content,
    documentType: body.documentType,
    jobTitle: body.jobTitle,
    company: body.company,
    applicantName: body.applicantName,
    accentColor: body.accentColor,
  };
  const filename = buildExportFilename(input, body.format);
  const bytes = body.format === "pdf" ? await buildPdf(input) : await buildDocx(input);
  const contentType =
    body.format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fileBytes = new Uint8Array(bytes);
  const fileBody = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength,
  );

  return new Response(fileBody, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
