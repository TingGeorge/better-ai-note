// The typed blocks the iPad app knows how to draw. Each kind has one SwiftUI renderer,
// so a block that does not match its shape exactly cannot be shown.

export type Block =
  | { kind: "table"; data: TableData }
  | { kind: "chart"; data: ChartData }
  | { kind: "steps"; data: StepsData }
  | { kind: "mindmap"; data: MindmapData }
  | { kind: "summary"; data: SummaryData };

export type BlockKind = Block["kind"];

export const BLOCK_KINDS: readonly BlockKind[] = ["table", "chart", "steps", "mindmap", "summary"];

export type TableData = {
  columns: string[];
  rows: (string | number)[][];
};

export type ChartData = {
  type: "bar" | "line" | "pie";
  labels: string[];
  series: { name: string; values: number[] }[];
};

export type StepsData = {
  steps: { text: string; note?: string }[];
};

export type MindmapNode = {
  label: string;
  children?: MindmapNode[];
};

export type MindmapData = {
  root: MindmapNode;
};

export type SummaryData = {
  points: string[];
  todos?: string[];
};

export type BlockCheck = { ok: true; block: Block } | { ok: false; problems: string[] };

const CHART_TYPES = ["bar", "line", "pie"];
// Deeper than this is unreadable on a canvas, and the limit stops runaway recursion
const MAX_MINDMAP_DEPTH = 6;

// Problems are written for the model: it reads them and tries again
export function checkBlock(value: unknown): BlockCheck {
  const problems: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, problems: ["block must be an object with `kind` and `data`"] };
  }

  const { kind, data } = value;
  if (typeof kind !== "string" || !BLOCK_KINDS.includes(kind as BlockKind)) {
    return { ok: false, problems: [`kind must be one of: ${BLOCK_KINDS.join(", ")}`] };
  }
  if (!isRecord(data)) {
    return { ok: false, problems: ["data must be an object"] };
  }

  switch (kind as BlockKind) {
    case "table":
      checkTable(data, problems);
      break;
    case "chart":
      checkChart(data, problems);
      break;
    case "steps":
      checkSteps(data, problems);
      break;
    case "mindmap":
      checkMindmapNode(data.root, "data.root", 1, problems);
      break;
    case "summary":
      checkSummary(data, problems);
      break;
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, block: { kind, data } as Block };
}

function checkTable(data: Record<string, unknown>, problems: string[]): void {
  const { columns, rows } = data;
  if (!isNonEmptyStringArray(columns)) {
    problems.push("data.columns must be a non-empty array of strings");
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    problems.push("data.rows must be a non-empty array of rows");
    return;
  }
  rows.forEach((row, i) => {
    if (!Array.isArray(row) || !row.every((cell) => typeof cell === "string" || isFiniteNumber(cell))) {
      problems.push(`data.rows[${i}] must be an array of strings or numbers`);
    } else if (row.length !== columns.length) {
      problems.push(`data.rows[${i}] has ${row.length} cells but there are ${columns.length} columns`);
    }
  });
}

function checkChart(data: Record<string, unknown>, problems: string[]): void {
  const { type, labels, series } = data;
  if (typeof type !== "string" || !CHART_TYPES.includes(type)) {
    problems.push(`data.type must be one of: ${CHART_TYPES.join(", ")}`);
  }
  if (!isNonEmptyStringArray(labels)) {
    problems.push("data.labels must be a non-empty array of strings");
    return;
  }
  if (!Array.isArray(series) || series.length === 0) {
    problems.push("data.series must be a non-empty array");
    return;
  }
  if (type === "pie" && series.length !== 1) {
    problems.push("a pie chart must have exactly one series");
  }
  series.forEach((s, i) => {
    if (!isRecord(s) || typeof s.name !== "string") {
      problems.push(`data.series[${i}] must be an object with a string \`name\``);
      return;
    }
    if (!Array.isArray(s.values) || !s.values.every(isFiniteNumber)) {
      problems.push(`data.series[${i}].values must be an array of numbers`);
    } else if (s.values.length !== labels.length) {
      problems.push(`data.series[${i}].values has ${s.values.length} numbers but there are ${labels.length} labels`);
    }
  });
}

function checkSteps(data: Record<string, unknown>, problems: string[]): void {
  const { steps } = data;
  if (!Array.isArray(steps) || steps.length === 0) {
    problems.push("data.steps must be a non-empty array");
    return;
  }
  steps.forEach((step, i) => {
    if (!isRecord(step) || !isNonEmptyString(step.text)) {
      problems.push(`data.steps[${i}] must be an object with a non-empty string \`text\``);
    } else if (step.note !== undefined && typeof step.note !== "string") {
      problems.push(`data.steps[${i}].note must be a string when present`);
    }
  });
}

function checkMindmapNode(node: unknown, path: string, depth: number, problems: string[]): void {
  if (depth > MAX_MINDMAP_DEPTH) {
    problems.push(`${path} is nested deeper than ${MAX_MINDMAP_DEPTH} levels`);
    return;
  }
  if (!isRecord(node) || !isNonEmptyString(node.label)) {
    problems.push(`${path} must be an object with a non-empty string \`label\``);
    return;
  }
  if (node.children === undefined) {
    return;
  }
  if (!Array.isArray(node.children)) {
    problems.push(`${path}.children must be an array when present`);
    return;
  }
  node.children.forEach((child, i) => checkMindmapNode(child, `${path}.children[${i}]`, depth + 1, problems));
}

function checkSummary(data: Record<string, unknown>, problems: string[]): void {
  const { points, todos } = data;
  if (!isNonEmptyStringArray(points)) {
    problems.push("data.points must be a non-empty array of strings");
  }
  if (todos !== undefined && !(Array.isArray(todos) && todos.every((t) => typeof t === "string"))) {
    problems.push("data.todos must be an array of strings when present");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
