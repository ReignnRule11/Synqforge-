import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { generatePrd } from "@/lib/ai/gateway";
import { createProviderConfig } from "@/lib/ai/provider";
import { createPrdGenerationHandlers } from "@/lib/projects/prd-generation";

export const runtime = "nodejs";

const handlers = createPrdGenerationHandlers({
  withCurrentUserTransaction,
  createProviderConfig,
  generatePrd,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
