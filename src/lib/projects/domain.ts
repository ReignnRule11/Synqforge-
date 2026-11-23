export const PROJECT_STATUSES = [
  "idea",
  "discovery",
  "planning",
  "design",
  "architecture",
  "building",
  "verification",
  "launch",
  "operations",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function allowedProjectTransitions(current: ProjectStatus): ProjectStatus[] {
  return [...TRANSITIONS[current]];
}
export type ProjectTarget = "web" | "mobile" | "web_mobile";

export interface ProjectBrief {
  problem: string;
  audience: string;
  proposedSolution: string;
  successCriteria: string[];
  constraints: string[];
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  target: ProjectTarget;
  status: ProjectStatus;
  brief: ProjectBrief;
  createdAt: string;
  updatedAt: string;
}

const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  idea: ["discovery", "archived"],
  discovery: ["idea", "planning", "archived"],
  planning: ["discovery", "design", "architecture", "archived"],
  design: ["planning", "architecture", "building", "archived"],
  architecture: ["planning", "design", "building", "archived"],
  building: ["architecture", "verification", "archived"],
  verification: ["building", "launch", "archived"],
  launch: ["verification", "operations", "archived"],
  operations: ["building", "archived"],
  archived: ["idea"],
};

export function canTransitionProject(
  current: ProjectStatus,
  next: ProjectStatus,
): boolean {
  return current === next || TRANSITIONS[current].includes(next);
}

export function transitionProject(
  project: Project,
  next: ProjectStatus,
): Project {
  if (!canTransitionProject(project.status, next)) {
    throw new Error(`Invalid project transition: ${project.status} -> ${next}`);
  }

  return { ...project, status: next, updatedAt: new Date().toISOString() };
}

export function validateProjectInput(input: {
  name?: unknown;
  description?: unknown;
  target?: unknown;
}): { name: string; description: string; target: ProjectTarget } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const target = input.target;

  if (name.length < 2 || name.length > 80) {
    throw new Error("Project name must be between 2 and 80 characters.");
  }
  if (description.length > 2000) {
    throw new Error("Project description must be 2,000 characters or fewer.");
  }
  if (target !== "web" && target !== "mobile" && target !== "web_mobile") {
    throw new Error("Choose a supported project target.");
  }

  return { name, description, target };
}
