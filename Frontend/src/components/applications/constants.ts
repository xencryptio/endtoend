import { ValueBasedTag } from "./types";

export const DUMMY_DATA = {
  filterOptions: {
    risk: [
      { category: "risk" as const, label: "High Risk", value: "High" },
      { category: "risk" as const, label: "Medium Risk", value: "Medium" },
      { category: "risk" as const, label: "Low Risk", value: "Low" }
    ],
    timeComplexity: [
      { category: "timeComplexity" as const, label: "High Complexity", value: "High" },
      { category: "timeComplexity" as const, label: "Medium Complexity", value: "Medium" },
      { category: "timeComplexity" as const, label: "Low Complexity", value: "Low" }
    ],
    quarter: [
      { category: "quarter" as const, label: "Q1", value: "Q1" },
      { category: "quarter" as const, label: "Q2", value: "Q2" },
      { category: "quarter" as const, label: "Q3", value: "Q3" },
      { category: "quarter" as const, label: "Q4", value: "Q4" },
      { category: "quarter" as const, label: "Q5", value: "Q5" },
      { category: "quarter" as const, label: "Q6", value: "Q6" }
    ],
    valueBasedTags: [
      { tag: "Critical Bottleneck", description: "Extremely risky and time-consuming — demands urgent action, high resources, and top priority." },
      { tag: "High-Stakes Project", description: "Risky with moderate complexity — needs tight monitoring and structured mid-term effort." },
      { tag: "Quick Risk Fix", description: "High risk but fast to resolve — quick mitigation brings immediate value. High ROI potential." },
      { tag: "Complex Opportunity", description: "Manageable risk but time-intensive — plan carefully. Can offer value if handled systematically." },
      { tag: "Strategic Task", description: "Balanced on both axes — ideal for standard project planning. Moderate, reliable value." },
      { tag: "Low-Hanging Fruit", description: "Some risk but very quick to resolve — should be prioritized early for easy wins." },
      { tag: "Resource Drain", description: "Not risky, but consumes a lot of time — often low value unless required by policy or mandate." },
      { tag: "Routine Task", description: "Low risk, moderate effort — good for backlog or routine workload. Steady, lower-priority value." },
      { tag: "Trivial Fix", description: "Minimal risk and effort — best suited for automation, training, or quick efficiency wins." }
    ]
  }
};

export const VALUE_BASED_MATRIX: Record<string, Record<string, ValueBasedTag>> = {
  High: {
    High: DUMMY_DATA.filterOptions.valueBasedTags[0],
    Medium: DUMMY_DATA.filterOptions.valueBasedTags[1],
    Low: DUMMY_DATA.filterOptions.valueBasedTags[2],
  },
  Medium: {
    High: DUMMY_DATA.filterOptions.valueBasedTags[3],
    Medium: DUMMY_DATA.filterOptions.valueBasedTags[4],
    Low: DUMMY_DATA.filterOptions.valueBasedTags[5],
  },
  Low: {
    High: DUMMY_DATA.filterOptions.valueBasedTags[6],
    Medium: DUMMY_DATA.filterOptions.valueBasedTags[7],
    Low: DUMMY_DATA.filterOptions.valueBasedTags[8],
  },
};