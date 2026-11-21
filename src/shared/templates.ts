import type { FileKind } from "./files";
import type { AiSetting } from "./protocol";

/** A ready-made group assignment: starter instructions and rubric, files, and tasks. */
export interface ProjectTemplate {
  id: string;
  label: string;
  description: string;
  instructions: string;
  rubric: string;
  ai: AiSetting;
  files: { kind: FileKind; title: string; markdown?: string }[];
  tasks: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "research-paper",
    label: "Research paper",
    description: "A group paper with sources and a works-cited list.",
    instructions:
      "Write a research paper on your topic as a group.\n\n- 1,000–1,500 words\n- At least 4 reliable sources, cited in MLA\n- Each person writes at least one section",
    rubric: "Research and sources 30% · Argument and organization 30% · Writing quality 25% · Citations 15%",
    ai: "tutor",
    files: [
      {
        kind: "doc",
        title: "Research paper",
        markdown: "# Title\n\n## Introduction\n\n## Background\n\n## Main points\n\n## Conclusion\n\n## Works cited\n",
      },
      { kind: "sheet", title: "Sources" },
    ],
    tasks: ["Choose a topic and research question", "Find 4 reliable sources", "Write the introduction", "Write the main sections", "Write the conclusion", "Format the works-cited list", "Proofread the whole paper"],
  },
  {
    id: "presentation",
    label: "Presentation",
    description: "A slide deck the group presents together.",
    instructions:
      "Make a group presentation on your topic.\n\n- 8–12 slides\n- At least 3 sources on a final slide\n- Everyone presents part of it",
    rubric: "Content and research 40% · Slides and design 30% · Delivery 30%",
    ai: "tutor",
    files: [
      { kind: "slides", title: "Presentation" },
      { kind: "doc", title: "Research notes", markdown: "# Research notes\n\n## Sources\n\n## Key facts\n" },
    ],
    tasks: ["Agree on the outline", "Research and collect sources", "Make the title and intro slides", "Make the main content slides", "Make the sources slide", "Write speaker notes", "Practice presenting together"],
  },
  {
    id: "science-lab",
    label: "Science lab",
    description: "A lab report with a data table and chart.",
    instructions:
      "Run the experiment and write a group lab report.\n\n- State your hypothesis before collecting data\n- Record all trials in the data sheet\n- Include a chart and explain what it shows",
    rubric: "Hypothesis and method 25% · Data and chart 30% · Analysis 30% · Conclusion 15%",
    ai: "tutor",
    files: [
      {
        kind: "doc",
        title: "Lab report",
        markdown: "# Lab report\n\n## Question\n\n## Hypothesis\n\n## Materials\n\n## Procedure\n\n## Results\n\n## Analysis\n\n## Conclusion\n",
      },
      { kind: "sheet", title: "Data" },
    ],
    tasks: ["Write the question and hypothesis", "List materials and procedure", "Record the data", "Make the chart", "Write the analysis", "Write the conclusion"],
  },
  {
    id: "survey-project",
    label: "Survey project",
    description: "Collect answers with a form, then analyze them.",
    instructions:
      "Design a survey, collect at least 20 responses, and present what you found.\n\n- 5–10 clear questions\n- A chart of the most interesting results\n- A short write-up of your findings",
    rubric: "Survey design 25% · Data collection 20% · Analysis and charts 30% · Findings write-up 25%",
    ai: "tutor",
    files: [
      { kind: "form", title: "Survey" },
      { kind: "doc", title: "Findings", markdown: "# Findings\n\n## What we asked\n\n## What we found\n\n## What it means\n" },
    ],
    tasks: ["Decide what you want to find out", "Write the survey questions", "Share the survey and collect 20 responses", "Turn responses into a sheet and chart", "Write up the findings"],
  },
  {
    id: "debate-prep",
    label: "Debate prep",
    description: "Arguments, evidence and rebuttals for both sides.",
    instructions:
      "Prepare for the debate on your resolution.\n\n- Three arguments for your side, each with evidence\n- The other side's strongest arguments and your rebuttals\n- An opening and a closing statement",
    rubric: "Arguments 30% · Evidence 30% · Rebuttals 25% · Opening and closing 15%",
    ai: "tutor",
    files: [
      {
        kind: "doc",
        title: "Debate case",
        markdown: "# Resolution\n\n## Our arguments\n\n## Evidence\n\n## Their arguments\n\n## Our rebuttals\n\n## Opening statement\n\n## Closing statement\n",
      },
    ],
    tasks: ["Research the resolution", "Write our three arguments", "Find evidence for each argument", "List the other side's arguments", "Write rebuttals", "Write the opening statement", "Write the closing statement"],
  },
];

export const templateById = (id: unknown) => PROJECT_TEMPLATES.find((t) => t.id === id);
