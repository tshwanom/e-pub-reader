import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import AdminSidebarNav from "./_components/AdminSidebarNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    redirect("/api/auth/signin");
  }

  const adminDisplayName = session.user.name || session.user.email || "Administrator";

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 2xl:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden xl:flex xl:sticky xl:top-8 xl:h-[calc(100vh-4rem)] xl:flex-col xl:overflow-hidden surface-card p-5">
            <div className="rounded-2xl bg-landing-accent px-5 py-5 text-white shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-white/15 p-2.5">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                    One Man Revolution
                  </p>
                  <h1 className="mt-1 font-playfair text-2xl">Admin studio</h1>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/80">
                Publish books, tune donor access, and generate narrated EPUB experiences without leaving the cockpit.
              </p>
            </div>

            <AdminSidebarNav className="mt-6 flex-1 overflow-y-auto pr-1" />
          </aside>

          <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-6">
            <section className="surface-card p-4 sm:p-5 xl:hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
                    One Man Revolution
                  </p>
                  <h1 className="mt-1 font-playfair text-2xl text-landing-text sm:text-[2rem]">
                    Admin studio
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                    Manage the catalog, donor access, and narration generation from a cleaner control surface.
                  </p>
                </div>
                <span className="rounded-2xl bg-landing-accent/10 p-2.5 text-landing-accent">
                  <Sparkles className="h-5 w-5" />
                </span>
              </div>

              <AdminSidebarNav compact className="mt-5" />
            </section>

            <header className="surface-card grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Authenticated as
                </p>
                <p className="mt-2 truncate text-xl font-semibold text-landing-text">
                  {adminDisplayName}
                </p>
                {session.user.email ? (
                  <p className="mt-1 truncate text-sm text-landing-text-muted">{session.user.email}</p>
                ) : null}
              </div>

              <div className="rounded-2xl bg-landing-accent/8 px-4 py-4 ring-1 ring-landing-accent/10">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-landing-accent/10 p-2 text-landing-accent">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-landing-text">Narration-ready workspace</p>
                    <p className="mt-1 text-sm leading-6 text-landing-text-muted">
                      Gemini TTS and donor playback can now be managed directly from each book editor without leaving the admin flow.
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
