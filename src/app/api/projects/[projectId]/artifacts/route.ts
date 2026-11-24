import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { createProjectArtifactHandlers } from "@/lib/projects/artifact-route";

export const runtime = "nodejs";

const handlers = createProjectArtifactHandlers({ withCurrentUserTransaction });

export const GET = handlers.GET;
export const POST = handlers.POST;
