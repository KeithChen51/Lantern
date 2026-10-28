import { describe, expect, it } from "vitest";
import { actionCaseTags, filterActionCases } from "./case-filters";
import type { PublicActionCaseSummary } from "./public-action-cases";

const cases = [
  { slug: "a", title: "客户等候沟通", summary: "说明预计交车时间", question: "如何照顾客户？", tags: ["客户沟通", "服务现场", "服务现场"] },
  { slug: "b", title: "顾问身后的空间", summary: "保留操作通道", question: "如何调整门店布局？", tags: ["服务现场", "空间布置"] },
] as PublicActionCaseSummary[];
describe("Action case lookup", () => {
  it("matches title, summary, question and actual labels with all query words", () => {
    expect(filterActionCases(cases, "  客户 交车  ", "客户沟通").map(item => item.slug)).toEqual(["a"]);
    expect(filterActionCases(cases, "布局", "").map(item => item.slug)).toEqual(["b"]);
    expect(filterActionCases(cases, "", "服务现场")).toHaveLength(2);
    expect(filterActionCases(cases, "不存在", "")).toEqual([]);
    expect(filterActionCases(cases, "", "不存在")).toEqual([]);
    expect(filterActionCases(cases, "", "")).toEqual(cases);
  });
  it("counts each existing label once per readable case without inventing categories", () => {
    expect(actionCaseTags(cases)[0]).toEqual(["服务现场", 2]);
    expect(actionCaseTags(cases)).toHaveLength(3);
    expect(actionCaseTags([])).toEqual([]);
  });
});
