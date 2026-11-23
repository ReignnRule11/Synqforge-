"use client";

import { useMemo, useState, type FormEvent } from "react";
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

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const filteredWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.name.toLowerCase().includes(search.toLowerCase())),
    [workspaces, search],
  );

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
              <button key={label} type="button" disabled={label !== "Overview"} title={label !== "Overview" ? "Available in a later milestone" : undefined} onClick={() => setActiveNav(label)} className={"nav-link " + (activeNav === label ? "active" : "")}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </section>
        ))}

        <div className="sidebar-bottom">
          <div className="usage">
            <div className="usage-title"><span>Workspace status</span><span>Foundation</span></div>
            <div className="usage-track"><div /></div>
            <p>Workspace persistence is connected. Product creation is the next milestone.</p>
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
              <p>Your workspace foundation is connected. Create and switch between persistent team spaces.</p>
            </div>
            <button className="primary" type="button" onClick={() => { setCreateOpen(true); setError(""); }}><Plus size={17} /> Create workspace</button>
          </div>

          {notice && <div className="notice" role="status"><Check size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div>}

          <div className="stats">
            <div className="stat-card"><div className="stat-label">Your workspaces <Layers3 size={16} /></div><strong>{String(workspaces.length).padStart(2, "0")}</strong><span className="stat-foot">Persistent PostgreSQL records</span></div>
            <div className="stat-card"><div className="stat-label">Current role <ShieldCheck size={16} /></div><strong className="ready">{activeWorkspace?.role ?? "—"}</strong><span className="stat-foot">Enforced by database policies</span></div>
            <div className="stat-card"><div className="stat-label">Project engine <FolderKanban size={16} /></div><strong>Next</strong><span className="stat-foot">Project persistence not connected</span></div>
            <div className="stat-card"><div className="stat-label">Authentication <Activity size={16} /></div><strong className="ready">Verified</strong><span className="stat-foot">GitHub OAuth session</span></div>
          </div>

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
              <div className="panel-head"><div><h2>Project engine</h2><p>Persistent project records are the next build step.</p></div><span className="tag">IN PROGRESS</span></div>
              <div className="activity-empty"><div className="empty-icon"><FolderKanban size={22} /></div><b>No projects are connected yet.</b><p>This dashboard no longer displays sample projects. Project creation will be enabled after its authenticated API and tenant-isolation tests are complete.</p></div>
            </section>
          </div>
          <div className="footer-note"><span><Atom size={14} /> SynqForge workspace foundation</span><span>Authenticated data · PostgreSQL-backed</span></div>
        </div>
      </main>

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
