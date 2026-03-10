import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiTask =
  | "device-insight"
  | "fmea-draft"
  | "compliance-alert"
  | "device-summary"
  | "audit-report"
  | "intended-use";

type AiRequest = {
  task?: AiTask;
  payload?: unknown;
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function buildPrompt(task: AiTask, payload: unknown): string {
  const input = JSON.stringify(payload ?? {}, null, 2);

  switch (task) {
    case "device-insight":
      return [
        "Du bist QA/RA Assistant für MDR/ISO 13485.",
        "Analysiere das Gerät und antworte als JSON mit Feldern:",
        `{
  "deviceType": string,
  "riskSignals": string[],
  "missingDocs": string[],
  "recommendation": string,
  "complianceScore": number,
  "documentStatus": string
}`,
        "complianceScore muss 0..100 sein. Sprache: Deutsch.",
        `Input:\n${input}`,
      ].join("\n");
    case "fmea-draft":
      return [
        "Erzeuge einen kompakten FMEA-Draft auf Deutsch.",
        "Antworte als JSON mit Feld:",
        `{"draft": string}`,
        "Der Draft soll konkrete Failure Modes, Ursachen und Maßnahmen enthalten.",
        `Input:\n${input}`,
      ].join("\n");
    case "compliance-alert":
      return [
        "Prüfe, welche MDR-relevanten Dokumente vermutlich fehlen.",
        "Antworte als JSON mit Feldern:",
        `{"missingDocs": string[], "alertText": string}`,
        "Sprache: Deutsch.",
        `Input:\n${input}`,
      ].join("\n");
    case "device-summary":
      return [
        "Erstelle eine Audit-taugliche Geräte-Zusammenfassung auf Deutsch.",
        "Antworte als JSON mit Feld:",
        `{"summary": string}`,
        "Soll enthalten: Produktbeschreibung, Zweckbestimmung, Risikoübersicht, Dokumentstatus.",
        `Input:\n${input}`,
      ].join("\n");
    case "audit-report":
      return [
        "Erstelle einen kompakten Audit-Vorbericht auf Deutsch.",
        "Antworte als JSON mit Feld:",
        `{"report": string}`,
        "Soll enthalten: Scope, Risiken, Dokumente, Änderungen/Aktivitäten.",
        `Input:\n${input}`,
      ].join("\n");
    case "intended-use":
      return [
        "Handle wie ein MDR-/ISO-13485-Professor.",
        "Erzeuge eine professionelle Draft-Zweckbestimmung (Intended Use) auf Deutsch.",
        "Nutze streng den gelieferten Kontext und erfinde keine klinischen Claims.",
        "Antworte als JSON mit Feldern:",
        `{
  "intendedUse": string,
  "missingContext": string[],
  "regulatoryWarnings": string[],
  "reviewStatusSuggestion": "Draft" | "Review" | "Approved"
}`,
        "Wenn relevante Angaben fehlen, liste sie in missingContext.",
        "Wenn der Text für Freigabe noch riskant ist, setze reviewStatusSuggestion auf Review.",
        `Input:\n${input}`,
      ].join("\n");
    default:
      return `Unbekannter Task. Input:\n${input}`;
  }
}

async function callOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du bist ein präziser Medical QA/RA Assistant. Antworte immer als valides JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Fehler (${response.status}): ${errText}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = raw.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Leere OpenAI-Antwort.");
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI-Antwort ist kein valides JSON.");
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AiRequest;
    const task = body.task;

    if (!task) {
      return NextResponse.json({ error: "task fehlt." }, { status: 400 });
    }

    const prompt = buildPrompt(task, body.payload);
    const result = await callOpenAI(prompt);

    return NextResponse.json({ ok: true, task, result }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unerwarteter KI-Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
