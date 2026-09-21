export type QuestionType = "boolean" | "choice" | "score";

export type OptionDraft = {
  id: string;
  key: string;
  description: string;
};

export type LevelDraft = {
  id: string;
  label: string;
};

export type QuestionDraft = {
  id: string;
  key: string;
  type: QuestionType;
  instructions: string;
  trueCriteria: string;
  falseCriteria: string;
  options: OptionDraft[];
  levels: LevelDraft[];
};

export type StateMode = "text" | "json";

export type BuiltQuestion =
  | {
      type: "boolean";
      instructions: string;
      criteria?: { true?: string; false?: string };
    }
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    }
  | {
      type: "score";
      instructions: string;
      criteria: string[];
    };

export type EvaluatePayload = {
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, BuiltQuestion>;
};

export type Example = {
  id: string;
  label: string;
  stateMode: StateMode;
  state: string;
  questions: QuestionDraft[];
};

export function newId() {
  return crypto.randomUUID();
}

function nextKey(existing: QuestionDraft[], prefix: string) {
  const keys = new Set(existing.map((question) => question.key));
  if (!keys.has(prefix)) return prefix;
  let n = 2;
  while (keys.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function blankQuestion(
  type: QuestionType,
  existing: QuestionDraft[],
): QuestionDraft {
  if (type === "boolean") {
    return {
      id: newId(),
      key: nextKey(existing, "flag"),
      type,
      instructions: "Is this true?",
      trueCriteria: "",
      falseCriteria: "",
      options: [],
      levels: [],
    };
  }

  if (type === "choice") {
    return {
      id: newId(),
      key: nextKey(existing, "route"),
      type,
      instructions: "Which option fits?",
      trueCriteria: "",
      falseCriteria: "",
      options: [
        { id: newId(), key: "a", description: "" },
        { id: newId(), key: "b", description: "" },
      ],
      levels: [],
    };
  }

  return {
    id: newId(),
    key: nextKey(existing, "grade"),
    type,
    instructions: "Rate this.",
    trueCriteria: "",
    falseCriteria: "",
    options: [],
    levels: [
      { id: newId(), label: "low" },
      { id: newId(), label: "medium" },
      { id: newId(), label: "high" },
    ],
  };
}

function cloneDraft(question: QuestionDraft): QuestionDraft {
  return {
    ...question,
    options: question.options.map((option) => ({ ...option })),
    levels: question.levels.map((level) => ({ ...level })),
  };
}

export const EXAMPLES: Example[] = [
  {
    id: "refund",
    label: "Refund",
    stateMode: "text",
    state: "The support agent issued a full refund to the customer.",
    questions: [
      {
        id: "refunded",
        key: "refunded",
        type: "boolean",
        instructions: "Was a refund issued to the customer?",
        trueCriteria: "The agent confirmed that money was returned.",
        falseCriteria: "No refund was issued, or the refund was declined.",
        options: [],
        levels: [],
      },
    ],
  },
  {
    id: "ticket",
    label: "Ticket",
    stateMode: "json",
    state: `{
  "subject": "Stripe sync broken",
  "message": "My Stripe connection has failed for three days and I am losing sales. Refund me for this month.",
  "plan": "pro",
  "previousTickets": 2
}`,
    questions: [
      {
        id: "department",
        key: "department",
        type: "choice",
        instructions: "Which team should handle this ticket?",
        trueCriteria: "",
        falseCriteria: "",
        options: [
          {
            id: "billing",
            key: "billing",
            description: "Charges, invoices, and refunds",
          },
          {
            id: "technical",
            key: "technical",
            description: "Bugs, outages, and integration failures",
          },
          {
            id: "account",
            key: "account",
            description: "Login, permissions, and profile changes",
          },
          {
            id: "other",
            key: "other",
            description: "Anything that does not fit the other teams",
          },
        ],
        levels: [],
      },
      {
        id: "severity",
        key: "severity",
        type: "score",
        instructions: "How severe is the issue for the customer?",
        trueCriteria: "",
        falseCriteria: "",
        options: [],
        levels: [
          { id: "s0", label: "Cosmetic or informational" },
          { id: "s1", label: "Degraded, but a workaround exists" },
          { id: "s2", label: "Blocking with no workaround" },
          {
            id: "s3",
            label: "Blocking and causing financial or data loss",
          },
        ],
      },
      {
        id: "requestsRefund",
        key: "requestsRefund",
        type: "boolean",
        instructions: "Is the customer asking for money back?",
        trueCriteria: "",
        falseCriteria: "",
        options: [],
        levels: [],
      },
    ],
  },
  {
    id: "pr",
    label: "PR",
    stateMode: "text",
    state:
      "The PR adds tests, updates docs, and has a clear description of why the change exists.",
    questions: [
      {
        id: "quality",
        key: "quality",
        type: "score",
        instructions: "Rate the quality of this pull request.",
        trueCriteria: "",
        falseCriteria: "",
        options: [],
        levels: [
          { id: "p0", label: "poor: no tests or docs" },
          { id: "p1", label: "fair: partial coverage" },
          { id: "p2", label: "good: tests and docs" },
          { id: "p3", label: "excellent: tests, docs, and clear rationale" },
        ],
      },
    ],
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[1];

export function loadExample(example: Example): Example {
  return {
    ...example,
    questions: example.questions.map(cloneDraft),
  };
}

export function parseState(
  mode: StateMode,
  text: string,
): { ok: true; state: EvaluatePayload["state"] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "State is empty." };
  }

  if (mode === "text") {
    return { ok: true, state: trimmed };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "State JSON is invalid." };
  }

  if (typeof parsed === "string") {
    return { ok: true, state: parsed };
  }
  if (Array.isArray(parsed)) {
    return { ok: true, state: parsed };
  }
  if (parsed !== null && typeof parsed === "object") {
    return { ok: true, state: parsed as Record<string, unknown> };
  }

  return {
    ok: false,
    error: "State JSON must be a string, object, or array.",
  };
}

export function buildPayload(
  mode: StateMode,
  stateText: string,
  drafts: QuestionDraft[],
): { ok: true; payload: EvaluatePayload } | { ok: false; error: string } {
  const stateResult = parseState(mode, stateText);
  if (!stateResult.ok) return stateResult;

  if (drafts.length === 0) {
    return { ok: false, error: "Add at least one question." };
  }

  const questions: Record<string, BuiltQuestion> = {};

  for (const draft of drafts) {
    const key = draft.key.trim();
    if (!key) {
      return { ok: false, error: "Every question needs a key." };
    }
    if (key in questions) {
      return { ok: false, error: `Duplicate question key: ${key}` };
    }

    const instructions = draft.instructions.trim();
    if (!instructions) {
      return { ok: false, error: `Question “${key}” needs instructions.` };
    }

    if (draft.type === "boolean") {
      const trueCriteria = draft.trueCriteria.trim();
      const falseCriteria = draft.falseCriteria.trim();
      questions[key] = {
        type: "boolean",
        instructions,
        ...(trueCriteria || falseCriteria
          ? {
              criteria: {
                ...(trueCriteria ? { true: trueCriteria } : {}),
                ...(falseCriteria ? { false: falseCriteria } : {}),
              },
            }
          : {}),
      };
      continue;
    }

    if (draft.type === "choice") {
      const criteria: Record<string, string> = {};
      for (const option of draft.options) {
        const optionKey = option.key.trim();
        if (!optionKey) continue;
        if (optionKey in criteria) {
          return {
            ok: false,
            error: `Question “${key}” has a duplicate option: ${optionKey}`,
          };
        }
        criteria[optionKey] = option.description.trim();
      }
      if (Object.keys(criteria).length === 0) {
        return {
          ok: false,
          error: `Question “${key}” needs at least one choice option.`,
        };
      }
      questions[key] = { type: "choice", instructions, criteria };
      continue;
    }

    const criteria = draft.levels.map((level) => level.label.trim());
    if (criteria.some((label) => !label)) {
      return { ok: false, error: `Question “${key}” has an empty score level.` };
    }
    if (criteria.length < 2) {
      return {
        ok: false,
        error: `Question “${key}” needs at least two score levels.`,
      };
    }
    questions[key] = { type: "score", instructions, criteria };
  }

  return {
    ok: true,
    payload: { state: stateResult.state, questions },
  };
}

export function formatProbability(value: number) {
  return value.toFixed(2);
}
