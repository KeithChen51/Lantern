"use client";

import { Icon } from "@iconify/react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import styles from "./hermit-v3.module.css";

export const HERMIT_SCENARIOS = [
  { title: "找知识依据", description: "从灯塔中找到相关原则与规范", draft: "我想找一找这个服务问题的知识依据：", icon: lighthouseIcons.mirror },
  { title: "对照相似案例", description: "看看类似问题如何处理", draft: "请帮我对照相似案例，分析这个服务场景：", icon: lighthouseIcons.action },
  { title: "结合材料分析", description: "上传材料，梳理问题与改进方向", draft: "请结合我上传的材料，梳理问题与改进方向：", icon: lighthouseIcons.document },
] as const;

export function ScenarioCards({ onSelect }: { onSelect: (draft: string) => void }) {
  return <div className={styles.scenarioCards} aria-label="快捷提示词">
    {HERMIT_SCENARIOS.map(scenario => <button type="button" className={styles.scenarioCard} key={scenario.title} onClick={() => onSelect(scenario.draft)}>
      <Icon icon={scenario.icon} aria-hidden="true" />
      <strong>{scenario.title}</strong><span>{scenario.description}</span>
    </button>)}
  </div>;
}
