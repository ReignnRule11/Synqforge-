import { NextResponse } from "next/server";
import { createPrdGenerationHandlers, prdGenerationDependencies } from "@/lib/projects/prd-generation";

export const runtime = "nodejs";

const handlers = createPrdGenerationHandlers({
  ...prdGenerationDependencies,
  // Keep NextResponse as the framework response implementation in production.
});

export const GET = async (request: Request, context: { params: Promise<{ projectId: string }> }) => {
  const response = await handlers.GET(request, context);
  return NextResponse.json(await response.json(), { status: response.status, headers: response.headers });
};

export const POST = async (request: Request, context: { params: Promise<{ projectId: string }> }) => {
  const response = await handlers.POST(request, context);
  return NextResponse.json(await response.json(), { status: response.status, headers: response.headers });
};
