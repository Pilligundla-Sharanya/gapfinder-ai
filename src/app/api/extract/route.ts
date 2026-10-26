import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

export async function POST(request: NextRequest) {
  let parser: PDFParse | undefined;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file received. Please select a file and try again." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "The selected file is empty." },
        { status: 400 }
      );
    }

    const maxFileSize = 10 * 1024 * 1024;

    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: "File size must not exceed 10 MB." },
        { status: 413 }
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = "";

    if (extension === "pdf") {
      parser = new PDFParse({ data: buffer });

      const result = await parser.getText();
      extractedText = result.text;
    } else if (extension === "txt") {
      extractedText = buffer.toString("utf8");
    } else if (extension === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      return NextResponse.json(
        {
          error: "Unsupported file type. Upload a PDF, TXT, or DOCX file."
        },
        { status: 415 }
      );
    }

    extractedText = extractedText.trim();

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "No readable text was found. This PDF may contain scanned images instead of selectable text."
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      filename: file.name,
      characters: extractedText.length,
      text: extractedText
    });
  } catch (error) {
    console.error("Document extraction failed:", error);

    const message =
      error instanceof Error ? error.message : "Unknown extraction error";

    return NextResponse.json(
      { error: `Document extraction failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (cleanupError) {
        console.error("PDF parser cleanup failed:", cleanupError);
      }
    }
  }
}
