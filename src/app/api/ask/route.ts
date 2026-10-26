
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing from .env.local." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const question = body?.question;
    const text = body?.text;

    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "Enter a question first." },
        { status: 400 }
      );
    }

    if (typeof text !== "string" || text.trim().length < 50) {
      return NextResponse.json(
        { error: "Upload and extract study material first." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are the GapFinder AI study assistant.

Answer the student's question using the study material provided.
Explain concepts in clear, beginner-friendly language.
Use examples when useful.
If the answer is not supported by the supplied material, clearly say so.
Do not invent quotations, page numbers, or citations.

STUDENT QUESTION:
${question.slice(0, 2000)}

STUDY MATERIAL:
${text.slice(0, 25000)}`,
    });

    if (!result.text) {
      throw new Error("Gemini returned an empty answer.");
    }

    return NextResponse.json({ answer: result.text });
  } catch (error) {
    console.error("Topic assistant failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to answer this question.",
      },
      { status: 500 }
    );
  }
}
