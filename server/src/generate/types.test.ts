import { describe, expect, test } from "bun:test";

import { checkBlock } from "./types.ts";

function problemsOf(value: unknown): string[] {
  const result = checkBlock(value);
  return result.ok ? [] : result.problems;
}

describe("checkBlock", () => {
  test("accepts_one_valid_block_of_each_kind", () => {
    const blocks = [
      { kind: "table", data: { columns: ["Name", "Score"], rows: [["Amy", 90]] } },
      { kind: "chart", data: { type: "bar", labels: ["Mon", "Tue"], series: [{ name: "Hours", values: [2, 3] }] } },
      { kind: "steps", data: { steps: [{ text: "Apply the chain rule", note: "Check the sign" }, { text: "Simplify" }] } },
      { kind: "mindmap", data: { root: { label: "Cell", children: [{ label: "Nucleus" }] } } },
      { kind: "summary", data: { points: ["Launch moves to May"], todos: ["Send the budget"] } },
    ];
    for (const block of blocks) {
      expect(checkBlock(block)).toEqual({ ok: true, block } as never);
    }
  });

  test("rejects_unknown_kind", () => {
    expect(problemsOf({ kind: "poem", data: {} })[0]).toContain("kind must be one of");
  });

  test("rejects_table_row_with_wrong_cell_count", () => {
    const problems = problemsOf({ kind: "table", data: { columns: ["A", "B"], rows: [["x"]] } });
    expect(problems).toEqual(["data.rows[0] has 1 cells but there are 2 columns"]);
  });

  test("rejects_chart_series_length_mismatch_and_bad_type", () => {
    const problems = problemsOf({
      kind: "chart",
      data: { type: "scatter", labels: ["a", "b"], series: [{ name: "s", values: [1] }] },
    });
    expect(problems).toEqual([
      "data.type must be one of: bar, line, pie",
      "data.series[0].values has 1 numbers but there are 2 labels",
    ]);
  });

  test("rejects_pie_chart_with_two_series", () => {
    const problems = problemsOf({
      kind: "chart",
      data: { type: "pie", labels: ["a"], series: [{ name: "x", values: [1] }, { name: "y", values: [2] }] },
    });
    expect(problems).toEqual(["a pie chart must have exactly one series"]);
  });

  test("rejects_non_finite_numbers", () => {
    const problems = problemsOf({
      kind: "chart",
      data: { type: "line", labels: ["a"], series: [{ name: "x", values: [Number.NaN] }] },
    });
    expect(problems).toEqual(["data.series[0].values must be an array of numbers"]);
  });

  test("rejects_empty_steps", () => {
    expect(problemsOf({ kind: "steps", data: { steps: [] } })).toEqual(["data.steps must be a non-empty array"]);
  });

  test("rejects_mindmap_deeper_than_six_levels", () => {
    let node: { label: string; children?: unknown[] } = { label: "leaf" };
    for (let i = 0; i < 6; i++) {
      node = { label: `level ${i}`, children: [node] };
    }
    const problems = problemsOf({ kind: "mindmap", data: { root: node } });
    expect(problems[0]).toContain("nested deeper than 6 levels");
  });

  test("rejects_summary_without_points", () => {
    expect(problemsOf({ kind: "summary", data: { points: [] } })).toEqual([
      "data.points must be a non-empty array of strings",
    ]);
  });
});
