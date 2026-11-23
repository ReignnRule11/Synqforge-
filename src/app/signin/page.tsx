import { signIn } from "../../../auth";

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#080b14] px-5 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/20 text-xl font-bold text-violet-200">S</div>
          <div>
            <h1 className="text-xl font-semibold">SynqForge</h1>
            <p className="text-xs tracking-widest text-slate-400">FROM IDEA TO INDUSTRY</p>
          </div>
        </div>
        <h2 className="text-2xl font-semibold">Sign in to your workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Authenticate with GitHub to access your SynqForge product workspace.</p>
        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-slate-200" type="submit">
            Continue with GitHub
          </button>
        </form>
        <p className="mt-6 text-xs leading-5 text-slate-500">Your workspace is protected by a verified server-side session. Authentication is required before application routes can be accessed.</p>
      </section>
    </main>
  );
}
