export const NUM_GROUPS = 15;

export type Photo = { id: string; w: number; h: number; name: string };
export type Material = { id: string; name: string; qty: string; unit: string; role: string; photo?: Photo };
export type Step = { id: string; title: string; action: string; materials: string; detail: string; photo?: Photo };
export type Draft = {
  materialsIntro: string;
  design: string;
  steps: { sourceStepId: string; title: string; paragraph: string }[];
  testing: string;
  improvement: string;
  missingInfo: string[];
};
export type Project = {
  classroom: string; groupNo: string; groupName: string; projectTitle: string; projectType: string;
  problem: string; objectives: string; design: string; materials: Material[]; steps: Step[];
  testMethod: string; testCount: string; testResult: string; testObservation: string; problems: string; improvements: string;
  draft?: Draft;
};

export type ProjectRow = {
  groupNo: number;
  data: Project;
  version: number;
  status: "draft" | "submitted";
  teacherComment: string;
  updatedAt: string;
  submittedAt: string | null;
};

export function newId(): string {
  return crypto.randomUUID();
}

export function blankProject(groupNo: number): Project {
  return {
    classroom: "ม.2/___", groupNo: String(groupNo), groupName: "", projectTitle: "", projectType: "สิ่งประดิษฐ์",
    problem: "", objectives: "", design: "",
    materials: [{ id: newId(), name: "", qty: "", unit: "ชิ้น", role: "" }],
    steps: [{ id: newId(), title: "เตรียมวัสดุและอุปกรณ์", action: "", materials: "", detail: "" }],
    testMethod: "", testCount: "", testResult: "", testObservation: "", problems: "", improvements: ""
  };
}

export function calcProgress(p: Partial<Project>): number {
  const checks = [
    !!p.projectTitle?.trim(), !!p.problem?.trim(), !!p.objectives?.trim(),
    !!p.materials?.some(m => m.name.trim()), !!p.steps?.some(s => s.action.trim() || s.detail.trim()),
    !!p.testMethod?.trim() || !!p.testResult?.trim()
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
