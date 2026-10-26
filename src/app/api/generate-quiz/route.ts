import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";



export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is missing from .env.local. Add your API key and restart the server.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const text = body?.text;

    if (typeof text !== "string" || text.trim().length < 100) {
      return NextResponse.json(
        {
          error:
            "Upload a study document containing at least 100 characters of extracted text.",
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Create exactly five multiple-choice diagnostic questions using only the study material below.

Return valid JSON only in this format:
{
  "questions": [
    {
      "topic": "Topic name",
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Short explanation based on the material"
    }
  ]
}

Requirements:
- Return exactly five questions.
- Give each question four distinct answer options.
- "correct" must be an integer from 0 to 3.
- Cover important concepts from the provided study material.
- Avoid ambiguous or repeated questions.
- Do not invent facts that are absent from the material.
- Return JSON only. Do not use Markdown code fences.

STUDY MATERIAL:
${text.slice(0, 30000)}`,
      config: {
        responseMimeType: "application/json",
      },
    });

    if (!result.text) {
      throw new Error("Gemini returned an empty response.");
    }

    const data = JSON.parse(result.text);

    if (
      !Array.isArray(data.questions) ||
      data.questions.length !== 5
    ) {
      throw new Error(
        "Gemini did not return exactly five questions. Please try again."
      );
    }

    for (const question of data.questions) {
      if (
        typeof question.topic !== "string" ||
        typeof question.question !== "string" ||
        !Array.isArray(question.options) ||
        question.options.length !== 4 ||
        !question.options.every(
          (option: unknown) => typeof option === "string"
        ) ||
        !Number.isInteger(question.correct) ||
        question.correct < 0 ||
        question.correct > 3 ||
        typeof question.explanation !== "string"
      ) {
        throw new Error(
          "Gemini returned a question in an invalid format."
        );
      }
    }

    return NextResponse.json({
      questions: data.questions,
    });
  } catch (error) {
    console.error("Quiz generation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate the quiz.",
      },
      { status: 500 }
    );
  }
}