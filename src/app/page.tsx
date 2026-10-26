"use client";

import { useRef, useState } from "react";

type Topic = {
  name: string;
  score: number;
  status: "Weak" | "Medium" | "Strong";
};

type QuizQuestion = {
  topic: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

type ExtractedDocument = {
  filename: string;
  characters: number;
  text: string;
};

type ExtractApiResponse = {
  error?: string;
  filename?: string;
  characters?: number;
  text?: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "txt", "docx"];

const navItems = [
  { name: "Overview", icon: "◫" },
  { name: "Study Materials", icon: "▤" },
  { name: "Diagnostic Quiz", icon: "☑" },
  { name: "Gap Report", icon: "▥" },
  { name: "Revision Plan", icon: "▦" },
  { name: "Topic Assistant", icon: "✳" },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [extractedDocuments, setExtractedDocuments] = useState<
    ExtractedDocument[]
  >([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [studyDays, setStudyDays] = useState("7");
  const [planGenerated, setPlanGenerated] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [assistantError, setAssistantError] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  const correctAnswers = questions.filter(
    (question, index) => answers[index] === question.correct
  ).length;

  const weakCount = topics.filter(
    (topic) => topic.status === "Weak"
  ).length;

  const mediumCount = topics.filter(
    (topic) => topic.status === "Medium"
  ).length;

  const strongCount = topics.filter(
    (topic) => topic.status === "Strong"
  ).length;

  const cardClass =
    "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

  const buttonClass =
    "rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

  async function processFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;

    setUploadError("");

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of selectedFiles) {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
        errors.push(`${file.name}: Choose a PDF, TXT, or DOCX file.`);
      } else if (file.size === 0) {
        errors.push(`${file.name}: This file is empty.`);
      } else if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Maximum file size is 10 MB.`);
      } else if (
        files.some(
          (existing) =>
            existing.name === file.name && existing.size === file.size
        )
      ) {
        errors.push(`${file.name}: This file is already selected.`);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      setUploadError(errors.join("\n"));
    }

    if (validFiles.length === 0) return;

    setFiles((previous) => [...previous, ...validFiles]);
    setIsExtracting(true);

    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });

        const responseText = await response.text();

        let data: ExtractApiResponse;

        try {
          data = JSON.parse(responseText) as ExtractApiResponse;
        } catch {
          throw new Error(
            `Extraction API returned an invalid response (HTTP ${response.status}). Check the terminal.`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error || `Extraction failed (HTTP ${response.status}).`
          );
        }

        if (
          typeof data.filename !== "string" ||
          typeof data.text !== "string" ||
          typeof data.characters !== "number"
        ) {
          throw new Error(
            "The extraction API response is missing document text."
          );
        }

        const document: ExtractedDocument = {
          filename: data.filename,
          characters: data.characters,
          text: data.text,
        };

        setExtractedDocuments((previous) => [
          ...previous.filter(
            (item) => item.filename !== document.filename
          ),
          document,
        ]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Extraction failed.";

        setUploadError((previous) =>
          [previous, `${file.name}: ${message}`]
            .filter(Boolean)
            .join("\n")
        );
      }
    }

    setIsExtracting(false);
  }

  function handleFileSelection(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    void processFiles(selected);
  }

  function removeFile(index: number) {
    const removed = files[index];

    setFiles((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index)
    );

    if (removed) {
      setExtractedDocuments((previous) =>
        previous.filter((doc) => doc.filename !== removed.name)
      );

      setQuestions([]);
      setAnswers({});
      setSubmitted(false);
      setTopics([]);
      setQuizError("");
    }
  }

  async function generateQuiz() {
    if (extractedDocuments.length === 0) {
      setQuizError("Upload and extract a study document first.");
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizError("");
    setSubmitted(false);
    setAnswers({});

    try {
      const studyText = extractedDocuments
        .map(
          (document) =>
            `Document: ${document.filename}\n${document.text}`
        )
        .join("\n\n")
        .slice(0, 30000);

      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: studyText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Quiz generation failed.");
      }

      if (
        !Array.isArray(data.questions) ||
        data.questions.length !== 5
      ) {
        throw new Error(
          "The AI did not return five questions. Please try again."
        );
      }

      const generatedQuestions =
        data.questions as QuizQuestion[];

      setQuestions(generatedQuestions);

      const topicNames = [
        ...new Set(
          generatedQuestions
            .map((question) => question.topic.trim())
            .filter(Boolean)
        ),
      ];

      setTopics(
        topicNames.map((name) => ({
          name,
          score: 0,
          status: "Weak" as const,
        }))
      );
    } catch (error) {
      setQuizError(
        error instanceof Error
          ? error.message
          : "Could not generate the quiz."
      );
    } finally {
      setIsGeneratingQuiz(false);
    }
  }

  function submitQuiz() {
    if (questions.length === 0) {
      setQuizError("Generate a quiz before submitting.");
      return;
    }

    if (
      questions.some((_, index) => answers[index] === undefined)
    ) {
      alert("Please answer all questions before submitting.");
      return;
    }

    setTopics((previousTopics) =>
      previousTopics.map((topic) => {
        const relatedQuestions = questions
          .map((question, index) => ({ question, index }))
          .filter(({ question }) => question.topic === topic.name);

        if (relatedQuestions.length === 0) return topic;

        const score = Math.round(
          (relatedQuestions.filter(
            ({ question, index }) =>
              answers[index] === question.correct
          ).length /
            relatedQuestions.length) *
            100
        );

        return {
          ...topic,
          score,
          status: (score < 50
            ? "Weak"
            : score < 80
              ? "Medium"
              : "Strong") as Topic["status"],
        };
      })
    );

    setSubmitted(true);
  }

  async function askAssistant() {
    if (!assistantQuestion.trim()) return;

    if (extractedDocuments.length === 0) {
      setAssistantError("Upload and extract study material first.");
      return;
    }

    setIsAsking(true);
    setAssistantError("");
    setAssistantAnswer("");

    try {
      const text = extractedDocuments
        .map(
          (document) =>
            `Document: ${document.filename}\n${document.text}`
        )
        .join("\n\n")
        .slice(0, 25000);

      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: assistantQuestion,
          text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "The assistant could not answer."
        );
      }

      setAssistantAnswer(data.answer);
    } catch (error) {
      setAssistantError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-slate-200 bg-white p-5 md:flex">
          <div className="mb-9 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
              G
            </div>
            <div>
              <h1 className="text-lg font-bold">GapFinder AI</h1>
              <p className="text-xs text-slate-500">
                AI Learning Companion
              </p>
            </div>
          </div>

          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Workspace
          </p>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setActive(item.name)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${
                  active === item.name
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="w-5 text-center text-lg">
                  {item.icon}
                </span>
                {item.name}
                {item.name === "Gap Report" && weakCount > 0 && (
                  <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                    {weakCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-indigo-50 p-4">
            <p className="text-sm font-semibold text-indigo-900">
              Small steps, big progress.
            </p>
            <p className="mt-2 text-xs leading-5 text-indigo-700">
              Focus on the topics that need you most.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
            <div>
              <p className="text-xs text-slate-500">
                YOUR LEARNING SPACE
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {active === "Overview"
                  ? "Your learning overview"
                  : active}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-500 sm:inline">
                Personal study workspace
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                S
              </div>
            </div>
          </header>

          <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">
            <select
              value={active}
              onChange={(event) => setActive(event.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            >
              {navItems.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mx-auto max-w-7xl p-5 sm:p-8">
            {active === "Overview" && (
              <>
                <div className="mb-7 overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 to-violet-600 p-6 text-white sm:p-8">
                  <p className="text-sm font-medium text-indigo-100">
                    YOUR PERSONALIZED STUDY SPACE
                  </p>
                  <h3 className="mt-3 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
                    Study what you don&apos;t know. Master what you do.
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">
                    Upload your materials, test your understanding,
                    discover gaps, and focus your revision.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActive("Study Materials")}
                    className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    Add study materials →
                  </button>
                </div>

                <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Topics tracked",
                      value: topics.length,
                      note: "Identified from your quiz",
                    },
                    {
                      label: "Weak topics",
                      value: weakCount,
                      note: "Need focused revision",
                    },
                    {
                      label: "Medium topics",
                      value: mediumCount,
                      note: "Need more practice",
                    },
                    {
                      label: "Strong topics",
                      value: strongCount,
                      note: "Keep knowledge fresh",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <p className="text-sm text-slate-500">
                        {stat.label}
                      </p>
                      <p className="mt-4 text-3xl font-bold">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {stat.note}
                      </p>
                    </div>
                  ))}
                </div>

                <div className={cardClass}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Your topic map</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Topics appear here after you complete a quiz.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActive("Gap Report")}
                      className="text-sm font-semibold text-indigo-600"
                    >
                      View report →
                    </button>
                  </div>

                  {topics.length === 0 ? (
                    <p className="mt-5 text-sm text-slate-500">
                      Upload a study document and generate your first
                      diagnostic quiz.
                    </p>
                  ) : (
                    <div className="mt-5 space-y-5">
                      {topics.map((topic) => (
                        <div key={topic.name}>
                          <div className="mb-2 flex justify-between gap-2">
                            <span className="text-sm font-medium">
                              {topic.name}
                            </span>
                            <span className="text-xs font-semibold">
                              {topic.status} · {topic.score}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                topic.status === "Weak"
                                  ? "bg-rose-400"
                                  : topic.status === "Medium"
                                    ? "bg-amber-400"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${topic.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {active === "Study Materials" && (
              <div className="max-w-3xl">
                <h3 className="text-2xl font-bold">Study materials</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Upload your syllabus, textbook chapters, class notes,
                  or past question papers.
                </p>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void processFiles(
                      Array.from(event.dataTransfer.files)
                    );
                  }}
                  className="mt-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-8 text-center sm:p-12"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
                    ↑
                  </div>
                  <h4 className="mt-4 font-bold">
                    Upload your study material
                  </h4>
                  <p className="mt-2 text-sm text-slate-500">
                    PDF, TXT, or DOCX · Maximum 10 MB per file
                  </p>

                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.txt,.docx"
                    multiple
                    className="hidden"
                    onChange={handleFileSelection}
                  />

                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={isExtracting}
                    className={`${buttonClass} mt-5`}
                  >
                    {isExtracting
                      ? "Reading documents..."
                      : "Choose files"}
                  </button>
                </div>

                {uploadError && (
                  <p
                    role="alert"
                    className="mt-4 whitespace-pre-wrap rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
                  >
                    {uploadError}
                  </p>
                )}

                <div className={`${cardClass} mt-6`}>
                  <h4 className="font-bold">
                    Selected materials ({files.length})
                  </h4>

                  {files.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      No files selected yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {files.map((file, index) => {
                        const extracted = extractedDocuments.some(
                          (doc) => doc.filename === file.name
                        );

                        return (
                          <div
                            key={`${file.name}-${file.size}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {file.name}
                              </p>
                              <p
                                className={`mt-1 text-xs ${
                                  extracted
                                    ? "text-emerald-700"
                                    : "text-slate-500"
                                }`}
                              >
                                {extracted
                                  ? "Text extracted successfully"
                                  : isExtracting
                                    ? "Processing..."
                                    : "Selected"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="shrink-0 text-sm font-medium text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={`${cardClass} mt-6`}>
                  <h4 className="font-bold">
                    Extracted text ({extractedDocuments.length} document(s))
                  </h4>

                  {extractedDocuments.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Extracted text will appear here after upload.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {extractedDocuments.map((doc) => (
                        <details
                          key={doc.filename}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <summary className="cursor-pointer text-sm font-semibold">
                            {doc.filename} ·{" "}
                            {doc.characters.toLocaleString()} characters
                          </summary>
                          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                            {doc.text.slice(0, 10000)}
                            {doc.text.length > 10000
                              ? "\n\nPreview limited to 10,000 characters."
                              : ""}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {active === "Diagnostic Quiz" && (
              <div className="max-w-3xl">
                <h3 className="text-2xl font-bold">
                  AI diagnostic quiz
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Questions are generated from your uploaded study material.
                </p>

                <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                  <p className="text-sm text-indigo-900">
                    {extractedDocuments.length
                      ? `${extractedDocuments.length} document(s) ready for quiz generation.`
                      : "Upload and extract a study document before generating a quiz."}
                  </p>

                  <button
                    type="button"
                    onClick={generateQuiz}
                    disabled={
                      isGeneratingQuiz ||
                      isExtracting ||
                      extractedDocuments.length === 0
                    }
                    className={`${buttonClass} mt-4`}
                  >
                    {isGeneratingQuiz
                      ? "Generating your quiz..."
                      : questions.length
                        ? "Generate a new quiz"
                        : "Generate AI quiz"}
                  </button>

                  {quizError && (
                    <p
                      role="alert"
                      className="mt-3 whitespace-pre-wrap text-sm text-rose-700"
                    >
                      {quizError}
                    </p>
                  )}
                </div>

                {isGeneratingQuiz && (
                  <p className="mt-5 text-sm text-indigo-600">
                    Gemini is analyzing your document and creating five
                    questions...
                  </p>
                )}

                {!isGeneratingQuiz && questions.length === 0 && (
                  <div className={`${cardClass} mt-6`}>
                    <h4 className="font-semibold">
                      Your quiz will appear here
                    </h4>
                    <p className="mt-2 text-sm text-slate-500">
                      Go to Study Materials, upload a file, wait for
                      extraction to finish, then return here.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActive("Study Materials")}
                      className="mt-4 font-semibold text-indigo-600"
                    >
                      Go to Study Materials →
                    </button>
                  </div>
                )}

                {questions.length > 0 && (
                  <>
                    <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                      Your quiz is ready. Answer all questions and submit
                      to update your topic ratings.
                    </div>

                    <div className="mt-6 space-y-5">
                      {questions.map((question, index) => (
                        <div
                          key={`${index}-${question.topic}`}
                          className={cardClass}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                            Question {index + 1} · {question.topic}
                          </p>
                          <h4 className="mt-3 font-semibold leading-6">
                            {question.question}
                          </h4>

                          <div className="mt-4 space-y-2">
                            {question.options.map(
                              (option, optionIndex) => (
                                <label
                                  key={`${index}-${optionIndex}`}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                                    answers[index] === optionIndex
                                      ? "border-indigo-400 bg-indigo-50"
                                      : "border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`question-${index}`}
                                    checked={
                                      answers[index] === optionIndex
                                    }
                                    disabled={submitted}
                                    onChange={() =>
                                      setAnswers((previous) => ({
                                        ...previous,
                                        [index]: optionIndex,
                                      }))
                                    }
                                    className="mt-0.5 accent-indigo-600"
                                  />
                                  <span>{option}</span>
                                </label>
                              )
                            )}
                          </div>

                          {submitted && (
                            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                              <p
                                className={
                                  answers[index] === question.correct
                                    ? "font-semibold text-emerald-700"
                                    : "font-semibold text-rose-700"
                                }
                              >
                                {answers[index] === question.correct
                                  ? "Correct answer!"
                                  : `Incorrect. Correct answer: ${question.options[question.correct]}`}
                              </p>
                              <p className="mt-2 leading-6 text-slate-600">
                                {question.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {!submitted && (
                      <button
                        type="button"
                        onClick={submitQuiz}
                        className={`${buttonClass} mt-5`}
                      >
                        Submit diagnostic
                      </button>
                    )}

                    {submitted && (
                      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                        <h4 className="font-bold text-emerald-900">
                          Quiz complete!
                        </h4>
                        <p className="mt-2 text-sm text-emerald-800">
                          You scored {correctAnswers} out of{" "}
                          {questions.length}. Your topic ratings have
                          been updated.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActive("Gap Report")}
                          className="mt-4 font-semibold text-emerald-800 underline"
                        >
                          View updated gap report
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {active === "Gap Report" && (
              <div>
                <h3 className="text-2xl font-bold">
                  Your knowledge gap report
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Topic ratings based on your submitted diagnostic quiz.
                </p>

                {topics.length === 0 ? (
                  <div className={`${cardClass} mt-6`}>
                    <p className="text-sm text-slate-500">
                      Complete a diagnostic quiz to see your knowledge gaps.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActive("Diagnostic Quiz")}
                      className="mt-4 font-semibold text-indigo-600"
                    >
                      Go to Diagnostic Quiz →
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      {[
                        {
                          label: "Weak",
                          count: weakCount,
                          color: "bg-rose-50 text-rose-700",
                        },
                        {
                          label: "Medium",
                          count: mediumCount,
                          color: "bg-amber-50 text-amber-700",
                        },
                        {
                          label: "Strong",
                          count: strongCount,
                          color: "bg-emerald-50 text-emerald-700",
                        },
                      ].map((item) => (
                        <div key={item.label} className={cardClass}>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${item.color}`}
                          >
                            {item.label}
                          </span>
                          <p className="mt-4 text-3xl font-bold">
                            {item.count}
                          </p>
                          <p className="text-sm text-slate-500">topics</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 space-y-4">
                      {topics.map((topic) => (
                        <div key={topic.name} className={cardClass}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className="font-bold">{topic.name}</h4>
                            <span className="text-sm font-semibold">
                              {topic.score}% · {topic.status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            {topic.status === "Weak"
                              ? "Prioritize this topic. Review the relevant material and practice more questions."
                              : topic.status === "Medium"
                                ? "Review the main concepts and practice until you can explain them confidently."
                                : "Good performance in this assessment. Revisit this topic periodically."}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {active === "Revision Plan" && (
              <div className="max-w-3xl">
                <h3 className="text-2xl font-bold">
                  Personalized revision plan
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Your weakest topics are scheduled first, based on your
                  quiz results.
                </p>

                <div className={`${cardClass} mt-6`}>
                  <label className="block text-sm font-semibold">
                    How many days do you have to prepare?
                  </label>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={studyDays}
                      onChange={(event) => {
                        setStudyDays(event.target.value);
                        setPlanGenerated(false);
                      }}
                      className="w-32 rounded-xl border border-slate-300 px-4 py-3"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          Number(studyDays) >= 1 &&
                          Number(studyDays) <= 90
                        ) {
                          setPlanGenerated(true);
                        } else {
                          alert("Enter a number of days between 1 and 90.");
                        }
                      }}
                      className={buttonClass}
                    >
                      Generate plan
                    </button>
                  </div>
                </div>

                {planGenerated && (
                  <div className="mt-6 space-y-3">
                    {topics.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Complete a diagnostic quiz first to personalize
                        your plan.
                      </p>
                    ) : (
                      [...topics]
                        .sort((a, b) => a.score - b.score)
                        .map((topic, index) => (
                          <div
                            key={topic.name}
                            className={`${cardClass} flex gap-4`}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700">
                              {index + 1}
                            </div>
                            <div>
                              <h4 className="font-semibold">
                                {topic.name}
                              </h4>
                              <p className="mt-1 text-sm text-slate-500">
                                {topic.status === "Weak"
                                  ? "Priority: revise core concepts, study examples, and practice questions."
                                  : topic.status === "Medium"
                                    ? "Priority: review key ideas and solve targeted exercises."
                                    : "Priority: short revision and retention practice."}
                              </p>
                              <p className="mt-2 text-xs font-semibold text-indigo-600">
                                Suggested time:{" "}
                                {Math.max(
                                  1,
                                  Math.round(
                                    (Number(studyDays) *
                                      (100 - topic.score)) /
                                      100
                                  )
                                )}{" "}
                                study day(s)
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}

            {active === "Topic Assistant" && (
              <div className="max-w-3xl">
                <h3 className="text-2xl font-bold">Topic assistant</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Ask a question about your uploaded study material.
                </p>

                <div className={`${cardClass} mt-6`}>
                  <label className="text-sm font-semibold">
                    What would you like to understand?
                  </label>
                  <textarea
                    value={assistantQuestion}
                    onChange={(event) =>
                      setAssistantQuestion(event.target.value)
                    }
                    placeholder="For example: Explain the main concepts in this chapter..."
                    rows={4}
                    className="mt-3 w-full rounded-xl border border-slate-300 p-4 text-sm outline-none focus:border-indigo-500"
                  />

                  <button
                    type="button"
                    onClick={askAssistant}
                    disabled={isAsking || !assistantQuestion.trim()}
                    className={`${buttonClass} mt-3`}
                  >
                    {isAsking ? "Thinking..." : "Ask about this topic"}
                  </button>

                  {assistantError && (
                    <p role="alert" className="mt-3 text-sm text-rose-700">
                      {assistantError}
                    </p>
                  )}

                  {assistantAnswer && (
                    <div className="mt-5 whitespace-pre-wrap rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-slate-700">
                      {assistantAnswer}
                    </div>
                  )}
                </div>
              </div>
            )}

            <footer className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-400">
              GapFinder AI · Learning gaps first, answers second.
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}