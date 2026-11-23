export { auth as middleware } from "./auth";

// API handlers own their JSON authentication contract; do not let page
// middleware turn unauthenticated API calls into HTML sign-in redirects.
export const config = {
  matcher: ["/((?!api/(auth|workspaces)|_next/static|_next/image|favicon.ico|signin).*)"],
};
