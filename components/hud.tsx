"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  blankQuestion,
  buildPayload,
  DEFAULT_EXAMPLE,
  EXAMPLES,
  formatProbability,
  loadExample,
  newId,
  type QuestionDraft,
  type QuestionType,
  type StateMode,
} from "@/lib/questions";

type BooleanAnswer = { type: "boolean"; probability: number };
type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
};
type ScoreAnswer = {
  type: "score";
  score: number;
  probabilities?: Record<string, number>;
};
type Answer = BooleanAnswer | ChoiceAnswer | ScoreAnswer;

type EvaluateSuccess = {
  model: string;
  answers: Record<string, Answer>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  rounding?: { probabilityDecimals?: number; scoreDecimals?: number };
  warnings?: unknown[];
  providerMetadata?: Record<string, unknown>;
  response?: { id?: string; timestamp?: string; modelId?: string };
};

const fieldClass =
  "w-full rounded-sm border border-line bg-inset px-2 py-2 text-sm text-ink outline-none placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-meter";

const ghostButtonClass =
  "inline-flex h-10 items-center justify-center rounded-sm border border-line bg-panel px-3 text-sm text-ink hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meter disabled:opacity-50";

export function Hud({ hasKey }: { hasKey: boolean }) {
  const [stateMode, setStateMode] = useState<StateMode>(DEFAULT_EXAMPLE.stateMode);
  const [stateText, setStateText] = useState(DEFAULT_EXAMPLE.state);
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    loadExample(DEFAULT_EXAMPLE).questions,
  );
  const [activeExample, setActiveExample] = useState(DEFAULT_EXAMPLE.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateSuccess | null>(null);
  const [pane, setPane] = useState<"answers" | "request" | "response">("answers");

  const built = useMemo(
    () => buildPayload(stateMode, stateText, questions),
    [stateMode, stateText, questions],
  );

  const requestJson = built.ok
    ? JSON.stringify(
        { model: "typesafe-ai/jev", ...built.payload },
        null,
        2,
      )
    : built.error;

  function applyExample(id: string) {
    const example = EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    const loaded = loadExample(example);
    setActiveExample(id);
    setStateMode(loaded.stateMode);
    setStateText(loaded.state);
    setQuestions(loaded.questions);
    setError(null);
    setResult(null);
  }

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    );
  }

  async function runEvaluate() {
    if (!built.ok) {
      setError(built.error);
      return;
    }
    if (!hasKey) {
      setError("Set AI_GATEWAY_API_KEY in .env.local, then restart the dev server.");
      return;
    }

    setBusy(true);
    setError(null);
    setPane("answers");

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`;
        setResult(null);
        setError(message);
        return;
      }
      setResult(data as EvaluateSuccess);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <a
        href="#state"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to state
      </a>

      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <div className="min-w-0 flex-1">
          <h1 className="text-balance font-medium text-lg">jev-hud</h1>
          <p className="truncate font-mono text-mute text-xs">
            typesafe-ai/jev · AI Gateway
          </p>
        </div>
        <p
          className={cn(
            "font-mono text-xs",
            hasKey ? "text-ink" : "text-danger",
          )}
        >
          {hasKey ? "AI_GATEWAY_API_KEY ready" : "AI_GATEWAY_API_KEY missing"}
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Example payloads">
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              className={cn(
                ghostButtonClass,
                "h-9",
                activeExample === example.id && "border-meter bg-inset",
              )}
              onClick={() => applyExample(example.id)}
            >
              {example.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col border-line border-b lg:border-r lg:border-b-0">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void runEvaluate();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void runEvaluate();
              }
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="state" className="text-sm">
                  State
                </label>
                <fieldset className="flex gap-1">
                  <legend className="sr-only">State format</legend>
                  {(["text", "json"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={cn(
                        ghostButtonClass,
                        "h-9 cursor-pointer px-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-meter",
                        stateMode === mode && "border-meter bg-inset",
                      )}
                    >
                      <input
                        type="radio"
                        name="state-mode"
                        value={mode}
                        checked={stateMode === mode}
                        onChange={() => setStateMode(mode)}
                        className="sr-only"
                      />
                      {mode}
                    </label>
                  ))}
                </fieldset>
              </div>
              <textarea
                id="state"
                value={stateText}
                onChange={(event) => setStateText(event.target.value)}
                spellCheck={stateMode === "text"}
                rows={stateMode === "json" ? 12 : 8}
                className={cn(fieldClass, "min-h-40 resize-y font-mono")}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm">Questions</h2>
                <div className="flex flex-wrap gap-1">
                  {(["boolean", "choice", "score"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={cn(ghostButtonClass, "h-9")}
                      onClick={() =>
                        setQuestions((current) => [
                          ...current,
                          blankQuestion(type, current),
                        ])
                      }
                    >
                      Add {type}
                    </button>
                  ))}
                </div>
              </div>

              {questions.length === 0 ? (
                <p className="text-pretty text-mute text-sm">
                  Add a boolean, choice, or score question.
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {questions.map((question) => (
                    <li key={question.id}>
                      <QuestionEditor
                        question={question}
                        onChange={(patch) => updateQuestion(question.id, patch)}
                        onRemove={() =>
                          setQuestions((current) =>
                            current.filter((item) => item.id !== question.id),
                          )
                        }
                      />
                    </li>
                  ))}
                </ol>
              )}
            </div>

            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-line border-t bg-canvas px-4 py-3 ps-14 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {error ? (
                <p role="alert" className="mr-auto text-pretty text-danger text-sm">
                  {error}
                </p>
              ) : !built.ok ? (
                <p className="mr-auto text-pretty text-mute text-sm">{built.error}</p>
              ) : (
                <p className="mr-auto text-mute text-xs">⌘/Ctrl + Enter</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 min-w-32 items-center justify-center rounded-sm bg-meter px-4 text-sm text-panel hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {busy ? "Evaluating" : "Evaluate"}
              </button>
            </div>
          </form>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-line border-b px-4 py-2">
            {(
              [
                ["answers", "Answers"],
                ["request", "Request"],
                ["response", "Response"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  ghostButtonClass,
                  "h-9",
                  pane === id && "border-meter bg-inset",
                )}
                onClick={() => setPane(id)}
              >
                {label}
              </button>
            ))}
            {result?.usage?.inputTokens != null ? (
              <p className="ml-auto font-mono text-mute text-xs tabular-nums">
                {result.usage.inputTokens} in
                {result.usage.outputTokens != null
                  ? ` · ${result.usage.outputTokens} out`
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {pane === "request" ? (
              <JsonBlock value={requestJson} />
            ) : pane === "response" ? (
              result ? (
                <JsonBlock value={JSON.stringify(result, null, 2)} />
              ) : (
                <EmptyOutput busy={busy} />
              )
            ) : busy ? (
              <AnswerSkeleton count={questions.length} />
            ) : result ? (
              <AnswerList
                answers={result.answers}
                questions={questions}
                confidence={readConfidence(result.providerMetadata)}
              />
            ) : (
              <EmptyOutput busy={false} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: QuestionDraft;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 border border-line bg-panel p-3">
      <legend className="px-1 text-mute text-xs">{question.type}</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,7rem)_auto]">
        <label className="flex flex-col gap-1 text-xs">
          Key
          <input
            value={question.key}
            onChange={(event) => onChange({ key: event.target.value })}
            className={cn(fieldClass, "font-mono")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Type
          <select
            value={question.type}
            onChange={(event) => {
              const type = event.target.value as QuestionType;
              const patch: Partial<QuestionDraft> = { type };
              if (type === "choice" && question.options.length === 0) {
                patch.options = [
                  { id: newId(), key: "a", description: "" },
                  { id: newId(), key: "b", description: "" },
                ];
              }
              if (type === "score" && question.levels.length < 2) {
                patch.levels = [
                  { id: newId(), label: "low" },
                  { id: newId(), label: "medium" },
                  { id: newId(), label: "high" },
                ];
              }
              onChange(patch);
            }}
            className={fieldClass}
          >
            <option value="boolean">boolean</option>
            <option value="choice">choice</option>
            <option value="score">score</option>
          </select>
        </label>
        <button
          type="button"
          className={cn(ghostButtonClass, "mt-5 h-10 justify-self-start")}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        Instructions
        <textarea
          value={question.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
          rows={2}
          className={cn(fieldClass, "resize-y")}
        />
      </label>

      {question.type === "boolean" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            True means
            <input
              value={question.trueCriteria}
              onChange={(event) => onChange({ trueCriteria: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            False means
            <input
              value={question.falseCriteria}
              onChange={(event) => onChange({ falseCriteria: event.target.value })}
              className={fieldClass}
            />
          </label>
        </div>
      ) : null}

      {question.type === "choice" ? (
        <div className="flex flex-col gap-2">
          {question.options.map((option, index) => (
            <div key={option.id} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
              <label className="flex flex-col gap-1 text-xs">
                Option {index + 1}
                <input
                  value={option.key}
                  onChange={(event) =>
                    onChange({
                      options: question.options.map((item) =>
                        item.id === option.id
                          ? { ...item, key: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className={cn(fieldClass, "font-mono")}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Description
                <input
                  value={option.description}
                  onChange={(event) =>
                    onChange({
                      options: question.options.map((item) =>
                        item.id === option.id
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                className={cn(ghostButtonClass, "mt-5")}
                onClick={() =>
                  onChange({
                    options: question.options.filter((item) => item.id !== option.id),
                  })
                }
              >
                Remove option
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cn(ghostButtonClass, "h-9 self-start")}
            onClick={() =>
              onChange({
                options: [
                  ...question.options,
                  { id: newId(), key: "", description: "" },
                ],
              })
            }
          >
            Add option
          </button>
        </div>
      ) : null}

      {question.type === "score" ? (
        <div className="flex flex-col gap-2">
          {question.levels.map((level, index) => (
            <div key={level.id} className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                Level {index}
                <input
                  value={level.label}
                  onChange={(event) =>
                    onChange({
                      levels: question.levels.map((item) =>
                        item.id === level.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                className={cn(ghostButtonClass, "mt-5")}
                onClick={() =>
                  onChange({
                    levels: question.levels.filter((item) => item.id !== level.id),
                  })
                }
              >
                Remove level
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cn(ghostButtonClass, "h-9 self-start")}
            onClick={() =>
              onChange({
                levels: [...question.levels, { id: newId(), label: "" }],
              })
            }
          >
            Add level
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function AnswerList({
  answers,
  questions,
  confidence,
}: {
  answers: Record<string, Answer>;
  questions: QuestionDraft[];
  confidence: Record<string, number>;
}) {
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return <p className="text-pretty text-mute text-sm">No answers returned.</p>;
  }

  return (
    <ol className="flex flex-col gap-5">
      {entries.map(([id, answer]) => {
        const draft = questions.find((question) => question.key === id);
        return (
          <li key={id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-mono text-sm">{id}</h3>
              <p className="font-mono text-mute text-xs tabular-nums">
                {answer.type}
                {confidence[id] != null
                  ? ` · confidence ${formatProbability(confidence[id])}`
                  : ""}
              </p>
            </div>
            {draft?.instructions ? (
              <p className="text-pretty text-mute text-sm">{draft.instructions}</p>
            ) : null}
            <AnswerMeter answer={answer} draft={draft} />
          </li>
        );
      })}
    </ol>
  );
}

function AnswerMeter({
  answer,
  draft,
}: {
  answer: Answer;
  draft?: QuestionDraft;
}) {
  if (answer.type === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between font-mono text-xs tabular-nums">
          <span>no</span>
          <span>{formatProbability(answer.probability)}</span>
          <span>yes</span>
        </div>
        <Meter value={answer.probability} />
      </div>
    );
  }

  if (answer.type === "choice") {
    const keys =
      draft?.options.map((option) => option.key.trim()).filter(Boolean) ??
      Object.keys(answer.probabilities ?? { [answer.choice]: 1 });
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm">
          {answer.choice}
        </p>
        <Distribution
          rows={keys.map((key) => ({
            label: key,
            value: answer.probabilities?.[key] ?? (key === answer.choice ? 1 : 0),
          }))}
        />
      </div>
    );
  }

  const levels = draft?.levels.map((level) => level.label) ?? [];
  const max = Math.max(levels.length - 1, 1);
  const rows =
    levels.length > 0
      ? levels.map((label, index) => ({
          label: `${index} ${label}`,
          value: answer.probabilities?.[String(index)] ?? 0,
        }))
      : Object.entries(answer.probabilities ?? {}).map(([key, value]) => ({
          label: key,
          value,
        }));

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-sm tabular-nums">
        {formatProbability(answer.score)}
        <span className="text-mute"> / {max}</span>
      </p>
      <Meter value={answer.score / max} />
      {rows.length > 0 ? <Distribution rows={rows} /> : null}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-2 bg-inset" aria-hidden="true">
      <div className="h-full bg-meter" style={{ width: `${width}%` }} />
    </div>
  );
}

function Distribution({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{row.label}</p>
            <Meter value={row.value} />
          </div>
          <p className="text-right font-mono text-xs tabular-nums">
            {formatProbability(row.value)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function JsonBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-pretty">
      {value}
    </pre>
  );
}

function EmptyOutput({ busy }: { busy: boolean }) {
  return (
    <p className="text-pretty text-mute text-sm">
      {busy
        ? "Evaluating…"
        : "Run Evaluate to see answers, or open Request to inspect the payload."}
    </p>
  );
}

function AnswerSkeleton({ count }: { count: number }) {
  const n = Math.max(count, 1);
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      {Array.from({ length: n }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="h-4 w-28 bg-inset" />
          <div className="h-2 bg-inset" />
          <div className="h-2 w-2/3 bg-inset" />
        </div>
      ))}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConfidence(
  metadata: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!isRecord(metadata) || !isRecord(metadata.typesafe)) return {};
  const confidence = metadata.typesafe.confidence;
  if (!isRecord(confidence)) return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(confidence)) {
    if (typeof value === "number") result[key] = value;
  }
  return result;
}
