"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import {
  Activity, ArrowUpRight, Atom, Blocks, Check, ChevronDown, CircleHelp,
  FolderKanban, Gauge, Layers3, LogOut, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Users, X,
} from "lucide-react";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
};

type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  target: "web" | "mobile" | "web_mobile";
  status: string;
  created_at: string;
  updated_at: string;
};

type Artifact = { id: string; artifact_type: string; title: string; version: number; content: Record<string, unknown>; created_at: string };

type Props = {
  initialWorkspaces: Workspace[];
  userName: string;
  userEmail: string;
};

const navGroups = [
  { label: "Workspace", items: [["Overview", Gauge], ["Projects", FolderKanban], ["Product intelligence", Sparkles], ["Design studio", Layers3], ["Architecture", Blocks]] },
  { label: "Build & ship", items: [["Build engine", Activity], ["Quality", ShieldCheck], ["Launch", ArrowUpRight]] },
  { label: "System", items: [["Members", Users], ["Settings", Settings2]] },
] as const;

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export default function WorkspaceDashboard({ initialWorkspaces, userName, userEmail }: Props) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaces[0]?.id ?? "");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(initialWorkspaces.length === 0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectTarget, setProjectTarget] = useState<Project["target"]>("web");
  const [projectCreating, setProjectCreating] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [nextProjectStatus, setNextProjectStatus] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactType, setArtifactType] = useState("prd");
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactContent, setArtifactContent] = useState('{"summary":"","problem":"","audience":"","solution":""}');
  const [artifactSaving, setArtifactSaving] = useState(false);



  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  useEffect(() => {
    if (!activeWorkspaceId) { setProjects([]); return; }
    let cancelled = false;
    setProjectsLoading(true);
    fetch(`/api/projects?workspace_id=${encodeURIComponent(activeWorkspaceId)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { projects?: Project[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Projects could not be loaded.");
        if (!cancelled) setProjects(Array.isArray(payload.projects) ? payload.projects : []);
      })
      .catch((cause) => { if (!cancelled) { setProjects([]); setProjectError(cause instanceof Error ? cause.message : "Projects could not be loaded."); } })
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!selectedProject) { setArtifacts([]); return; }
    let cancelled = false;
    setArtifactsLoading(true);
    fetch(`/api/projects/${encodeURIComponent(selectedProject.id)}/artifacts`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { artifacts?: Artifact[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Artifacts could not be loaded.");
        if (!cancelled) setArtifacts(Array.isArray(payload.artifacts) ? payload.artifacts : []);
      })
      .catch((cause) => { if (!cancelled) setDetailError(cause instanceof Error ? cause.message : "Artifacts could not be loaded."); })
      .finally(() => { if (!cancelled) setArtifactsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProject?.id]);

  async function createArtifact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || artifactSaving || activeWorkspace?.role === "viewer") return;
    let content: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(artifactContent);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Content must be a JSON object.");
      content = parsed as Record<string, unknown>;
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Artifact content must be valid JSON.");
      return;
    }
    setArtifactSaving(true);
    setDetailError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject.id)}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact_type: artifactType, title: artifactTitle, content }),
      });
      const payload = await response.json().catch(() => ({})) as { artifact?: Artifact; error?: string };
      if (!response.ok || !payload.artifact) throw new Error(payload.error || "Artifact could not be saved.");
      setArtifacts((current) => [payload.artifact!, ...current]);
      setArtifactTitle("");
      setNotice(`Saved ${payload.artifact.artifact_type} version ${payload.artifact.version}.`);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Artifact could not be saved.");
    } finally {
      setArtifactSaving(false);
    }
  }

  const filteredWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.name.toLowerCase().includes(search.toLowerCase())),
    [workspaces, search],
  );

  const nextStatuses: Record<string, string[]> = {
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

  async function openProject(project: Project) {
    setSelectedProject(project);
    setNextProjectStatus(project.status);
    setDetailError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`);
      const payload = await response.json().catch(() => ({})) as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Project details could not be loaded.");
      setSelectedProject(payload.project);
      setNextProjectStatus(payload.project.status);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Project details could not be loaded.");
    }
  }

  async function saveProjectStatus() {
    if (!selectedProject || !activeWorkspace || statusSaving || activeWorkspace.role === "viewer") return;
    setStatusSaving(true);
    setDetailError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextProjectStatus }),
      });
      const payload = await response.json().catch(() => ({})) as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Project status could not be updated.");
      setSelectedProject(payload.project);
      setProjects((current) => current.map((item) => item.id === payload.project!.id ? payload.project! : item));
      setNotice("Project lifecycle status updated.");
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Project status could not be updated.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
      });
      const payload = await response.json().catch(() => ({})) as {
        workspace?: Workspace;
        error?: string;
      };
      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error || "Workspace could not be created. Please try again.");
      }
      setWorkspaces((current) => [payload.workspace!, ...current.filter((item) => item.id !== payload.workspace!.id)]);
      setActiveWorkspaceId(payload.workspace.id);
      setWorkspaceName("");
      setCreateOpen(false);
      setWorkspaceMenuOpen(false);
      setNotice("Workspace created and saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspaceId || projectCreating) return;
    setProjectCreating(true);
    setProjectError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: activeWorkspaceId, name: projectName, description: projectDescription, target: projectTarget }),
      });
      const payload = await response.json().catch(() => ({})) as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Project could not be created.");
      setProjects((current) => [payload.project!, ...current.filter((item) => item.id !== payload.project!.id)]);
      setProjectName(""); setProjectDescription(""); setProjectTarget("web"); setProjectOpen(false);
      setNotice("Project created and saved to this workspace.");
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : "Project could not be created.");
    } finally { setProjectCreating(false); }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark"><Atom size={22} /></div>
          <div><b>SynqForge</b><small>PRODUCT OPERATING SYSTEM</small></div>
        </div>

        <div className="workspace-picker-wrap">
          <button className="workspace-select" type="button" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
            <span className="workspace-avatar">{activeWorkspace ? initials(activeWorkspace.name) : initials(userName)}</span>
            <span className="workspace-copy">
              <b>{activeWorkspace?.name ?? "No workspace yet"}</b>
              <small>{activeWorkspace ? `${activeWorkspace.role} workspace` : "Create your first workspace"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <div className="workspace-menu-heading">Your workspaces</div>
              {workspaces.map((workspace) => (
                <button key={workspace.id} type="button" className={"workspace-menu-item " + (workspace.id === activeWorkspaceId ? "selected" : "")} onClick={() => { setActiveWorkspaceId(workspace.id); setWorkspaceMenuOpen(false); setNotice(""); }}>
                  <span className="workspace-avatar small">{initials(workspace.name)}</span>
                  <span><b>{workspace.name}</b><small>{workspace.role}</small></span>
                  {workspace.id === activeWorkspaceId && <Check size={15} />}
                </button>
              ))}
              <button className="workspace-menu-create" type="button" onClick={() => { setWorkspaceMenuOpen(false); setCreateOpen(true); setError(""); }}>
                <Plus size={15} /> Create workspace
              </button>
            </div>
          )}
        </div>

        {navGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            <div className="group-label">{group.label}</div>
            {group.items.map(([label, Icon]) => (
              <button key={label} type="button" disabled={label !== "Overview" && label !== "Projects"} title={label !== "Overview" && label !== "Projects" ? "Available in a later milestone" : undefined} onClick={() => setActiveNav(label)} className={"nav-link " + (activeNav === label ? "active" : "")}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </section>
        ))}

        <div className="sidebar-bottom">
          <div className="usage">
            <div className="usage-title"><span>Workspace status</span><span>Foundation</span></div>
            <div className="usage-track"><div /></div>
            <p>Workspace and project records are persisted. Lifecycle controls are active.</p>
          </div>
          <button className="nav-link" type="button" onClick={() => setNotice("Documentation is not connected yet.")}><CircleHelp size={17} /><span>Help & documentation</span></button>
          <button className="nav-link" type="button" onClick={() => setNotice("Workspace settings will be enabled after the authorized settings API is implemented.")}><Settings2 size={17} /><span>Workspace settings</span></button>
          <div className="profile">
            <div className="avatar">{initials(userName)}</div>
            <div className="profile-copy"><b>{userName}</b><small>{userEmail || "GitHub account"}</small></div>
            <button className="signout-button" type="button" aria-label="Sign out" onClick={() => signOut({ redirectTo: "/signin" })}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span>/</span><b>{activeNav}</b></div>
          <div className="top-actions">
            <div className="search"><Search size={15} /><input aria-label="Search workspaces" placeholder="Search workspaces" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></div>
            <button className="icon-btn" type="button" aria-label="Activity" onClick={() => setNotice("Activity feed will be available after project events are connected.")}><Activity size={17} /></button>
            <button className="icon-btn" type="button" aria-label="Settings" onClick={() => setNotice("Workspace settings will be enabled after the authorized settings API is implemented.")}><Settings2 size={17} /></button>
          </div>
        </header>

        <div className="content">
          <div className="welcome">
            <div>
              <div className="eyebrow"><span className="live-dot" /> AUTHENTICATED PRODUCT WORKSPACE</div>
              <h1>Build with <span>clarity and control.</span></h1>
              <p>Create products inside a persistent workspace. Project access is enforced by your authenticated membership.</p>
            </div>
            <button className="primary" type="button" onClick={() => { setCreateOpen(true); setError(""); }}><Plus size={17} /> Create workspace</button>
          </div>

          {notice && <div className="notice" role="status"><Check size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div>}

          <div className="stats">
            <div className="stat-card"><div className="stat-label">Your workspaces <Layers3 size={16} /></div><strong>{String(workspaces.length).padStart(2, "0")}</strong><span className="stat-foot">Persistent PostgreSQL records</span></div>
            <div className="stat-card"><div className="stat-label">Current role <ShieldCheck size={16} /></div><strong className="ready">{activeWorkspace?.role ?? "—"}</strong><span className="stat-foot">Enforced by database policies</span></div>
            <div className="stat-card"><div className="stat-label">Project engine <FolderKanban size={16} /></div><strong className="ready">{projects.length}</strong><span className="stat-foot">Projects in selected workspace</span></div>
            <div className="stat-card"><div className="stat-label">Authentication <Activity size={16} /></div><strong className="ready">Verified</strong><span className="stat-foot">GitHub OAuth session</span></div>
          </div>

          <section className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <div><h2>Projects {activeWorkspace ? `· ${activeWorkspace.name}` : ""}</h2><p>Projects are isolated by workspace and database role.</p></div>
              <button className="primary" type="button" disabled={!activeWorkspace || activeWorkspace.role === "viewer"} onClick={() => { setProjectError(""); setProjectOpen(true); }}><Plus size={15} /> New project</button>
            </div>
            {projectError && !projectOpen && <p className="form-error" role="alert">{projectError}</p>}
            {projectsLoading ? <p>Loading workspace projects…</p> : projects.length ? (
              <div className="workspace-grid">
                {projects.map((project) => <article className="workspace-card" key={project.id}>
                  <div className="project-top"><div className="project-icon"><FolderKanban size={19} /></div><span className="role-chip">{project.status}</span></div>
                  <h3>{project.name}</h3><p className="project-desc">{project.description || "No project description yet."}</p>
                  <div className="workspace-card-meta"><span className="role-chip">{project.target.replace("_", " + ")}</span><span>Updated {new Date(project.updated_at).toLocaleDateString()}</span></div>
                  <div className="project-footer"><span>Workspace project</span><button type="button" onClick={() => void openProject(project)}>View details <ArrowUpRight size={13} /></button></div>
                </article>)}
              </div>
            ) : <div className="activity-empty"><div className="empty-icon"><FolderKanban size={22} /></div><b>{activeWorkspace ? "No projects in this workspace yet." : "Select or create a workspace first."}</b><p>{activeWorkspace?.role === "viewer" ? "You have read-only access to this workspace." : "Create the first project to begin its product lifecycle."}</p></div>}
          </section>

          <div className="section-heading">
            <div><h2>{activeNav === "Overview" ? "Your workspaces" : activeNav}</h2><p>Only workspaces associated with your authenticated membership are shown.</p></div>
            <span className="tag">LIVE DATA</span>
          </div>

          {filteredWorkspaces.length > 0 ? (
            <div className="workspace-grid">
              {filteredWorkspaces.map((workspace) => (
                <article className={"workspace-card " + (workspace.id === activeWorkspaceId ? "current" : "")} key={workspace.id}>
                  <div className="project-top"><div className="project-icon"><Layers3 size={19} /></div>{workspace.id === activeWorkspaceId && <span className="current-label"><Check size={12} /> CURRENT</span>}</div>
                  <h3>{workspace.name}</h3>
                  <p className="project-desc">/{workspace.slug}</p>
                  <div className="workspace-card-meta"><span className="role-chip">{workspace.role}</span><span>Created {new Date(workspace.created_at).toLocaleDateString()}</span></div>
                  <div className="project-footer"><span>Workspace access</span><button type="button" disabled={workspace.id === activeWorkspaceId} onClick={() => { setActiveWorkspaceId(workspace.id); setNotice(`Switched to ${workspace.name}.`); }}>{workspace.id === activeWorkspaceId ? "Selected" : "Switch workspace"} <ArrowUpRight size={13} /></button></div>
                </article>
              ))}
              <button className="new-project" type="button" onClick={() => setCreateOpen(true)}><div className="new-plus"><Plus size={19} /></div><b>Create another workspace</b><span>Keep products and collaborators organized in a separate space.</span></button>
            </div>
          ) : (
            <div className="empty-workspaces">
              <div className="empty-icon"><Layers3 size={22} /></div>
              <b>{search ? "No matching workspaces" : "Your first workspace starts here."}</b>
              <p>{search ? "Try another search term." : "Create a persistent workspace to establish your product team's home. Your membership is created atomically and protected by database access policies."}</p>
              {!search && <button className="primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} /> Create your first workspace</button>}
            </div>
          )}

          <div className="lower-grid">
            <section className="panel">
              <div className="panel-head"><div><h2>Product lifecycle</h2><p>The product engine roadmap.</p></div><span className="tag">PLANNED</span></div>
              <div className="lifecycle">{[["01", "Discover", "Research"], ["02", "Define", "PRD"], ["03", "Design", "UX"], ["04", "Architect", "System"], ["05", "Build", "Code"], ["06", "Verify", "QA"], ["07", "Launch", "Operate"]].map(([number, title, detail]) => <div className="life-step" key={number}><div className="life-icon"><span>{number}</span></div><b>{title}</b><small>{detail}</small></div>)}</div>
            </section>
            <section className="panel activity-panel">
              <div className="panel-head"><div><h2>Project engine</h2><p>Open a project to inspect its state and advance it through valid lifecycle stages.</p></div><span className="tag">IN PROGRESS</span></div>
              <div className="activity-empty"><div className="empty-icon"><FolderKanban size={22} /></div><b>No project activity yet.</b><p>Project details and lifecycle history will appear as projects advance through their stages.</p></div>
            </section>
          </div>
          <div className="footer-note"><span><Atom size={14} /> SynqForge workspace foundation</span><span>Authenticated data · PostgreSQL-backed</span></div>
        </div>
      </main>

      {selectedProject && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !statusSaving) setSelectedProject(null); }}>
          <section className="modal" aria-labelledby="project-detail-title">
            <div className="modal-head"><div className="modal-icon"><FolderKanban size={20} /></div><button className="close" type="button" aria-label="Close project details" disabled={statusSaving} onClick={() => setSelectedProject(null)}>×</button></div>
            <h2 id="project-detail-title">{selectedProject.name}</h2>
            <p>{selectedProject.description || "No project description has been added."}</p>
            <div className="workspace-card-meta"><span className="role-chip">{selectedProject.target.replace("_", " + ")}</span><span>Created {new Date(selectedProject.created_at).toLocaleDateString()}</span></div>
            <label htmlFor="project-status">Lifecycle status</label>
            <select id="project-status" className="modal-input" value={nextProjectStatus} disabled={activeWorkspace?.role === "viewer" || statusSaving} onChange={(event) => setNextProjectStatus(event.target.value)}>
              <option value={selectedProject.status}>{selectedProject.status}</option>
              {(nextStatuses[selectedProject.status] ?? []).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            {detailError && <p className="form-error" role="alert">{detailError}</p>}
            {activeWorkspace?.role === "viewer" ? <small className="modal-disclaimer">Viewer access is read-only. You can inspect this project but cannot change its lifecycle status.</small> : (
              <button className="primary modal-submit" type="button" disabled={statusSaving || nextProjectStatus === selectedProject.status} onClick={() => void saveProjectStatus()}>{statusSaving ? "Saving status…" : "Save lifecycle status"} <ArrowUpRight size={16} /></button>
            )}
            <div className="artifact-section">
              <div className="panel-head"><div><h3>Project documents</h3><p>Immutable, versioned artifacts attached to this project.</p></div><span className="tag">{artifacts.length} VERSIONS</span></div>
              {artifactsLoading ? <p>Loading document history…</p> : artifacts.length ? (
                <div className="artifact-list">{artifacts.map((artifact) => (
                  <details className="artifact-item" key={artifact.id}>
                    <summary><span><b>{artifact.title}</b><small>{artifact.artifact_type.replaceAll("_", " ")} · v{artifact.version}</small></span><small>{new Date(artifact.created_at).toLocaleDateString()}</small></summary>
                    <pre>{JSON.stringify(artifact.content, null, 2)}</pre>
                  </details>
                ))}</div>
              ) : <p className="modal-disclaimer">No documents have been saved for this project.</p>}
              {activeWorkspace?.role !== "viewer" && (
                <form className="artifact-form" onSubmit={createArtifact}>
                  <label htmlFor="artifact-type">Document type</label>
                  <select id="artifact-type" className="modal-input" value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>
                    <option value="product_brief">Product brief</option><option value="prd">PRD</option><option value="user_stories">User stories</option><option value="roadmap">Roadmap</option><option value="design_spec">Design specification</option><option value="architecture">Architecture</option><option value="api_contract">API contract</option><option value="database_schema">Database schema</option><option value="source_code">Source code</option><option value="test_report">Test report</option>
                  </select>
                  <label htmlFor="artifact-title">Document title</label>
                  <input id="artifact-title" className="modal-input" minLength={2} maxLength={160} required value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder="e.g. Product requirements v1" />
                  <label htmlFor="artifact-content">Structured content (JSON)</label>
                  <textarea id="artifact-content" className="modal-input artifact-json" rows={5} value={artifactContent} onChange={(event) => setArtifactContent(event.target.value)} required />
                  <button className="primary modal-submit" type="submit" disabled={artifactSaving || !artifactTitle.trim()}>{artifactSaving ? "Saving document…" : "Save new version"} <ArrowUpRight size={16} /></button>
                </form>
              )}
            </div>
            <small className="modal-disclaimer">Documents are append-only. Each save creates a new version; workspace roles and PostgreSQL RLS control access.</small>
          </section>
        </div>
      )}

      {projectOpen && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !projectCreating) setProjectOpen(false); }}>
          <form className="modal" onSubmit={createProject}>
            <div className="modal-head"><div className="modal-icon"><FolderKanban size={20} /></div><button className="close" type="button" aria-label="Close" disabled={projectCreating} onClick={() => setProjectOpen(false)}>×</button></div>
            <h2>Create a project</h2><p>This project will belong to <b>{activeWorkspace?.name}</b>. Your workspace role controls access.</p>
            <label htmlFor="project-name">Project name</label><input id="project-name" className="modal-input" maxLength={80} minLength={2} placeholder="e.g. Atlas Learning Platform" value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
            <label htmlFor="project-description">Description (optional)</label><textarea id="project-description" className="modal-input" maxLength={2000} rows={3} placeholder="What are you building?" value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
            <label htmlFor="project-target">Target</label><select id="project-target" className="modal-input" value={projectTarget} onChange={(event) => setProjectTarget(event.target.value as Project["target"])}><option value="web">Web</option><option value="mobile">Mobile</option><option value="web_mobile">Web + mobile</option></select>
            {projectError && <p className="form-error" role="alert">{projectError}</p>}
            <button className="primary modal-submit" type="submit" disabled={!projectName.trim() || projectCreating}>{projectCreating ? "Creating project…" : <><Plus size={16} /> Create project <ArrowUpRight size={16} /></>}</button>
            <small className="modal-disclaimer">Creator identity and permissions are enforced server-side and by PostgreSQL RLS.</small>
          </form>
        </div>
      )}

      {createOpen && (
        <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
          <form className="modal" onSubmit={createWorkspace}>
            <div className="modal-head"><div className="modal-icon"><Layers3 size={20} /></div><button className="close" type="button" aria-label="Close" disabled={creating} onClick={() => setCreateOpen(false)}>×</button></div>
            <h2>Create a workspace</h2>
            <p>Set up a persistent space for a product, team, or organization. You will become its owner.</p>
            <label htmlFor="workspace-name">Workspace name</label>
            <input id="workspace-name" className="modal-input" autoFocus maxLength={100} minLength={2} placeholder="e.g. Atlas Product Studio" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary modal-submit" type="submit" disabled={!workspaceName.trim() || creating}>{creating ? "Creating workspace…" : <><Plus size={16} /> Create workspace <ArrowUpRight size={16} /></>}</button>
            <small className="modal-disclaimer">Saved to PostgreSQL. Workspace ownership is assigned by the server, not the browser.</small>
          </form>
        </div>
      )}
    </div>
  );
}
