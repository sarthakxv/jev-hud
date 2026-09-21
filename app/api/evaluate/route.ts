import {
  APICallError,
  createGateway,
  experimental_evaluate as evaluate,
} from "ai";
import type { BuiltQuestion, EvaluatePayload } from "@/lib/questions";

const MODEL = "typesafe-ai/jev";

export const maxDuration = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isQuestion(value: unknown): value is BuiltQuestion {
  if (!isRecord(value) || typeof value.instructions !== "string") return false;
  if (value.type === "boolean") return true;
  if (value.type === "choice") return isRecord(value.criteria);
  if (value.type === "score") return Array.isArray(value.criteria);
  return false;
}

export async function POST(request: Request) {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Set AI_GATEWAY_API_KEY in .env.local, then restart the dev server.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!isRecord(body) || !("state" in body) || !isRecord(body.questions)) {
    return Response.json(
      { error: "Body must include state and a questions object." },
      { status: 400 },
    );
  }

  const questions: Record<string, BuiltQuestion> = {};
  for (const [key, question] of Object.entries(body.questions)) {
    if (!isQuestion(question)) {
      return Response.json(
        { error: `Question "${key}" is not a boolean, choice, or score.` },
        { status: 400 },
      );
    }
    questions[key] = question;
  }

  const payload: EvaluatePayload = {
    state: body.state as EvaluatePayload["state"],
    questions,
  };

  try {
    const gateway = createGateway({ apiKey });
    const result = await evaluate({
      model: gateway.evaluationModel(MODEL),
      state: payload.state as Parameters<typeof evaluate>[0]["state"],
      questions: payload.questions,
    });

    return Response.json({
      model: result.response.modelId,
      answers: result.answers,
      usage: result.usage,
      rounding: result.rounding,
      warnings: result.warnings,
      providerMetadata: result.providerMetadata,
      response: {
        id: result.response.id,
        timestamp: result.response.timestamp,
        modelId: result.response.modelId,
      },
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      return Response.json(
        { error: error.message, data: error.data },
        { status: error.statusCode ?? 502 },
      );
    }

    const message = error instanceof Error ? error.message : "Evaluation failed.";
    const status = message.startsWith("Invalid argument") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
