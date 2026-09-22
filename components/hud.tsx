"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

type Pane = "answers" | "request" | "response";

const TYPE_ITEMS = [
  { value: "boolean", label: "boolean" },
  { value: "choice", label: "choice" },
  { value: "score", label: "score" },
] as const;

const TYPE_LABEL: Record<QuestionType, string> = {
  boolean: "Bool",
  choice: "Choice",
  score: "Score",
};

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
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>("answers");

  const built = useMemo(
    () => buildPayload(stateMode, stateText, questions),
    [stateMode, stateText, questions],
  );

  const requestJson = built.ok
    ? JSON.stringify({ model: "typesafe-ai/jev", ...built.payload }, null, 2)
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
    setElapsedMs(null);
  }

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    );
  }

  async function runEvaluate() {
    if (busy) return;
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
    setElapsedMs(null);
    setPane("answers");
    const started = performance.now();

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
      setElapsedMs(performance.now() - started);
      setBusy(false);
    }
  }

  const status = error ?? (!built.ok ? built.error : null);
  const runEvaluateRef = useRef(runEvaluate);
  runEvaluateRef.current = runEvaluate;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const enter =
        event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
      if (!enter || event.repeat || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      void runEvaluateRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <a
        href="#state"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to state
      </a>

      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-balance font-medium">Jev HUD</h1>
            <p className="truncate font-mono text-muted-foreground text-xs">
              typesafe-ai/jev
            </p>
          </div>
        </div>

        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[activeExample]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) applyExample(next);
          }}
          aria-label="Example payloads"
        >
          {EXAMPLES.map((example) => (
            <ToggleGroupItem key={example.id} value={example.id}>
              {example.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Badge variant={hasKey ? "secondary" : "destructive"}>
          {hasKey ? "Services online" : "Services offline"}
        </Badge>

        <div className="flex items-center gap-3">
          {status ? null : (
            <p className="text-muted-foreground text-xs">⌘/Ctrl + Enter</p>
          )}
          <Button type="submit" form="evaluate" disabled={busy}>
            {busy ? "Evaluating" : "Evaluate"}
          </Button>
        </div>

        {status ? (
          <p role="alert" className="basis-full text-pretty text-destructive text-sm">
            {status}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto lg:overflow-hidden">
        <div className="grid min-w-0 lg:h-full lg:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
          <section className="pane-scroll min-h-0 min-w-0 border-b lg:overflow-y-auto lg:border-r lg:border-b-0">
            <form
              id="evaluate"
              className="flex min-w-0 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              onSubmit={(event) => {
                event.preventDefault();
                void runEvaluate();
              }}
            >
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
                    <Flag className="size-3.5" aria-hidden="true" />
                    Request · State
                  </CardTitle>
                  <CardAction>
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      spacing={0}
                      value={[stateMode]}
                      onValueChange={(value) => {
                        const next = value[0];
                        if (next === "text" || next === "json") setStateMode(next);
                      }}
                      aria-label="State format"
                    >
                      <ToggleGroupItem value="text">Text</ToggleGroupItem>
                      <ToggleGroupItem value="json">JSON</ToggleGroupItem>
                    </ToggleGroup>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Label htmlFor="state" className="sr-only">
                    State
                  </Label>
                  <Textarea
                    id="state"
                    value={stateText}
                    onChange={(event) => setStateText(event.target.value)}
                    spellCheck={stateMode === "text"}
                    rows={stateMode === "json" ? 12 : 8}
                    className="min-h-44 resize-y bg-background font-mono text-sm"
                  />
                  <p className="text-muted-foreground text-xs">
                    state: {stateMode === "text" ? "string" : "json"}
                  </p>
                </CardContent>
                <CardFooter className="justify-between bg-transparent font-mono text-muted-foreground text-xs tabular-nums">
                  <span>
                    {questions.length}{" "}
                    {questions.length === 1 ? "question" : "questions"}
                  </span>
                  {result?.usage?.inputTokens != null ? (
                    <span>
                      {result.usage.inputTokens} in
                      {result.usage.outputTokens != null
                        ? ` · ${result.usage.outputTokens} out`
                        : ""}
                    </span>
                  ) : (
                    <span>Not evaluated</span>
                  )}
                </CardFooter>
              </Card>

              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-sm">Questions</h2>
                  <div className="flex flex-wrap gap-1">
                    {(["boolean", "choice", "score"] as const).map((type) => (
                      <Button
                        key={type}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setQuestions((current) => [
                            ...current,
                            blankQuestion(type, current),
                          ])
                        }
                      >
                        Add {type}
                      </Button>
                    ))}
                  </div>
                </div>

                {questions.length === 0 ? (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="text-balance text-sm">
                        No questions yet
                      </CardTitle>
                      <CardDescription className="text-pretty">
                        Add a boolean, choice, or score question.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  <ol className="flex flex-col gap-3">
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
            </form>
          </section>

          <section className="min-h-0 min-w-0 lg:overflow-y-auto" aria-busy={busy}>
            <div className="flex min-w-0 max-w-3xl flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Tabs
                value={pane}
                onValueChange={(value) => {
                  if (value === "answers" || value === "request" || value === "response") {
                    setPane(value);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <TabsList>
                    <TabsTrigger value="answers">Answers</TabsTrigger>
                    <TabsTrigger value="request">Request</TabsTrigger>
                    <TabsTrigger value="response">Response</TabsTrigger>
                  </TabsList>
                  {elapsedMs != null && !busy ? (
                    <p className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                      <span className="sr-only">Evaluation time </span>
                      {formatDuration(elapsedMs)}
                    </p>
                  ) : null}
                </div>
                <TabsContent value="answers" className="pt-1">
                  {busy ? (
                    <AnswerSkeleton count={questions.length} />
                  ) : result ? (
                    <AnswerList
                      answers={result.answers}
                      questions={questions}
                      confidence={readConfidence(result.providerMetadata)}
                    />
                  ) : (
                    <EmptyOutput />
                  )}
                </TabsContent>
                <TabsContent value="request" className="pt-1">
                  <JsonBlock value={requestJson} />
                </TabsContent>
                <TabsContent value="response" className="pt-1">
                  {result ? (
                    <JsonBlock value={JSON.stringify(result, null, 2)} />
                  ) : (
                    <EmptyOutput />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </section>
        </div>
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
  const keyId = `${question.id}-key`;
  const typeId = `${question.id}-type`;
  const instructionsId = `${question.id}-instructions`;

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="uppercase">{TYPE_LABEL[question.type]}</Badge>
          <span className="truncate font-mono text-muted-foreground text-sm">
            {question.key.trim() || "untitled"}
          </span>
        </div>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={keyId}>Key</Label>
            <Input
              id={keyId}
              value={question.key}
              onChange={(event) => onChange({ key: event.target.value })}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={typeId}>Type</Label>
            <Select
              items={TYPE_ITEMS}
              value={question.type}
              onValueChange={(value) => {
                if (value !== "boolean" && value !== "choice" && value !== "score") {
                  return;
                }
                const patch: Partial<QuestionDraft> = { type: value };
                if (value === "choice" && question.options.length === 0) {
                  patch.options = [
                    { id: newId(), key: "a", description: "" },
                    { id: newId(), key: "b", description: "" },
                  ];
                }
                if (value === "score" && question.levels.length < 2) {
                  patch.levels = [
                    { id: newId(), label: "low" },
                    { id: newId(), label: "medium" },
                    { id: newId(), label: "high" },
                  ];
                }
                onChange(patch);
              }}
            >
              <SelectTrigger id={typeId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={instructionsId}>Instructions</Label>
          <Textarea
            id={instructionsId}
            value={question.instructions}
            onChange={(event) => onChange({ instructions: event.target.value })}
            rows={2}
            className="resize-y"
          />
        </div>

        {question.type === "boolean" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${question.id}-true`}>True means</Label>
              <Input
                id={`${question.id}-true`}
                value={question.trueCriteria}
                onChange={(event) => onChange({ trueCriteria: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${question.id}-false`}>False means</Label>
              <Input
                id={`${question.id}-false`}
                value={question.falseCriteria}
                onChange={(event) => onChange({ falseCriteria: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        {question.type === "choice" ? (
          <div className="flex flex-col gap-3">
            <Separator />
            {question.options.map((option, index) => (
              <div key={option.id} className="flex flex-col gap-2">
                <div className="grid gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${option.id}-key`}>Option {index + 1}</Label>
                    <Input
                      id={`${option.id}-key`}
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
                      className="font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${option.id}-description`}>Description</Label>
                    <Input
                      id={`${option.id}-description`}
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
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    onChange({
                      options: question.options.filter((item) => item.id !== option.id),
                    })
                  }
                >
                  Remove option
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
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
            </Button>
          </div>
        ) : null}

        {question.type === "score" ? (
          <div className="flex flex-col gap-3">
            <Separator />
            {question.levels.map((level, index) => (
              <div key={level.id} className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor={`${level.id}-label`}>Level {index}</Label>
                  <Input
                    id={`${level.id}-label`}
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
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      levels: question.levels.filter((item) => item.id !== level.id),
                    })
                  }
                >
                  Remove level
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                onChange({
                  levels: [...question.levels, { id: newId(), label: "" }],
                })
              }
            >
              Add level
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
  const known = questions.map((question) => question.key).filter((key) => key in answers);
  const extra = Object.keys(answers).filter(
    (key) => !questions.some((question) => question.key === key),
  );
  const keys = [...known, ...extra];

  if (keys.length === 0) {
    return <p className="text-pretty text-muted-foreground text-sm">No answers returned.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {keys.map((id) => {
        const answer = answers[id];
        if (!answer) return null;
        const draft = questions.find((question) => question.key === id);
        return (
          <li key={id}>
            <AnswerCard
              id={id}
              answer={answer}
              draft={draft}
              confidence={confidence[id]}
            />
          </li>
        );
      })}
    </ol>
  );
}

function AnswerCard({
  id,
  answer,
  draft,
  confidence,
}: {
  id: string;
  answer: Answer;
  draft?: QuestionDraft;
  confidence?: number;
}) {
  const hero =
    answer.type === "boolean"
      ? formatProbability(answer.probability)
      : answer.type === "score"
        ? formatProbability(answer.score)
        : null;

  return (
    <Card className="min-w-0">
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="uppercase">{TYPE_LABEL[answer.type]}</Badge>
          <span className="truncate font-mono text-muted-foreground text-sm">{id}</span>
        </div>
        {hero ? (
          <p className="font-medium text-3xl tabular-nums leading-none">{hero}</p>
        ) : confidence != null ? (
          <p className="font-mono text-muted-foreground text-xs tabular-nums">
            Confidence {formatProbability(confidence)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {draft?.instructions ? (
          <p className="text-pretty text-sm">{draft.instructions}</p>
        ) : null}
        <AnswerMeter answer={answer} draft={draft} />
      </CardContent>
      {answer.type === "score" ? (
        <CardFooter className="bg-transparent font-mono text-muted-foreground text-xs tabular-nums">
          {confidence != null
            ? `Confidence ${formatProbability(confidence)} · Weighted across levels`
            : "Weighted across levels"}
        </CardFooter>
      ) : null}
    </Card>
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
      <div className="flex flex-col gap-2">
        <Meter value={answer.probability} label="Yes probability" />
        <div className="flex justify-between font-mono text-muted-foreground text-xs tabular-nums">
          <span>0 No</span>
          <span>1 Yes</span>
        </div>
      </div>
    );
  }

  if (answer.type === "choice") {
    const keys =
      draft?.options.map((option) => option.key.trim()).filter(Boolean) ??
      Object.keys(answer.probabilities ?? { [answer.choice]: 1 });
    return (
      <Distribution
        rows={keys.map((key) => ({
          label: key,
          value: answer.probabilities?.[key] ?? (key === answer.choice ? 1 : 0),
        }))}
      />
    );
  }

  const levels = draft?.levels.map((level) => level.label) ?? [];
  const rows =
    levels.length > 0
      ? levels.map((label, index) => ({
          index,
          label,
          value: answer.probabilities?.[String(index)] ?? 0,
        }))
      : Object.entries(answer.probabilities ?? {}).map(([key, value]) => ({
          label: key,
          value,
        }));

  return rows.length > 0 ? <Distribution rows={rows} /> : null;
}

function Meter({ value, label }: { value: number; label: string }) {
  const width = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

function Distribution({
  rows,
}: {
  rows: { label: string; value: number; index?: number }[];
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const active = max > 0 && row.value === max;
        return (
          <li
            key={`${row.index ?? ""}-${row.label}`}
            className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,1.5fr)_2.5rem] items-center gap-3"
          >
            <p
              className={cn(
                "min-w-0 truncate text-sm",
                active ? "font-medium" : "text-muted-foreground",
              )}
              title={row.label}
            >
              {row.index != null ? (
                <span className="mr-2 font-mono text-muted-foreground tabular-nums">
                  {row.index}
                </span>
              ) : null}
              {row.label}
            </p>
            <Meter value={row.value} label={row.label} />
            <p className="text-right font-mono text-xs tabular-nums">
              {formatProbability(row.value)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function JsonBlock({ value }: { value: string }) {
  return (
    <Card className="min-w-0">
      <CardContent>
        <pre className="max-w-full overflow-x-auto font-mono text-xs">
          {value}
        </pre>
      </CardContent>
    </Card>
  );
}

function EmptyOutput() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-balance text-base">No answers yet</CardTitle>
        <CardDescription className="text-pretty">
          Evaluate this state to score each question.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="submit" form="evaluate">
          Evaluate
        </Button>
      </CardContent>
    </Card>
  );
}

function AnswerSkeleton({ count }: { count: number }) {
  const n = Math.max(count, 1);
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-16" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-1.5 w-4/5 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
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
