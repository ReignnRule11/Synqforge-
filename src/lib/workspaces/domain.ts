export type WorkspaceInput = { name: string; slug: string };

/** Derive a stable URL-safe slug from a display name. */
export function workspaceSlugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

export function parseWorkspaceName(value: unknown): WorkspaceInput | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < 2 || name.length > 100) return null;
  const slug = workspaceSlugFromName(name);
  if (!slug) return null;
  return { name, slug };
}
