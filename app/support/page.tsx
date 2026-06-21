import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import DonationSection from '@/components/DonationSection';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { HeartHandshake, BookOpen, ShieldCheck, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  const currentUserEmail = session?.user?.email ?? null;

  return (
    <main className="page-shell bg-gradient-to-b from-white to-landing-bg">
      <Header />

      {/* Hero Section */}
      <section className="page-container py-14 sm:py-20">
        <div className="mx-auto max-w-4xl text-center space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-landing-border bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-landing-accent">
            Our Funding Model
          </span>
          <h1 className="font-playfair text-4xl font-semibold leading-tight text-landing-text md:text-6xl">
            Why Support One Man Revolution?
          </h1>
          <p className="font-playfair text-2xl italic text-landing-text-muted">
            Knowledge Should Not Be Locked Away
          </p>
        </div>
      </section>

      {/* Core Declaration Section */}
      <section className="page-container pb-16">
        <div className="mx-auto max-w-3xl space-y-12">
          {/* Section 1: Simple Belief */}
          <div className="surface-card p-8 sm:p-12 space-y-6">
            <h2 className="font-playfair text-2xl font-semibold text-landing-text">
              The Mission Before the Money
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-landing-text-muted">
              <p>
                One Man Revolution was founded on a simple belief:
              </p>
              <blockquote className="border-l-2 border-landing-accent pl-4 font-crimson text-xl italic text-landing-text">
                "Knowledge that can help awaken, empower, and liberate human beings should not be hidden behind a paywall."
              </blockquote>
              <p>
                That is why the majority of our books, articles, videos, documentaries, and educational resources are available free of charge.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg bg-landing-bg-secondary p-3 text-center border border-landing-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">Not Marketing</span>
                </div>
                <div className="rounded-lg bg-landing-bg-secondary p-3 text-center border border-landing-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">Not Promotion</span>
                </div>
                <div className="rounded-lg bg-landing-bg-secondary p-3 text-center border border-landing-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">Not Limited Time</span>
                </div>
              </div>
              <p className="pt-2">
                Free because the mission comes before the money. If a person is searching for answers, they should be able to access them regardless of their financial circumstances.
              </p>
              <p className="font-semibold text-landing-accent">
                We believe truth should travel further than any sales funnel.
              </p>
            </div>
          </div>

          {/* Section 2: Why We Ask */}
          <div className="surface-card p-8 sm:p-12 space-y-6">
            <h2 className="font-playfair text-2xl font-semibold text-landing-text">
              Then Why Do We Ask For Support?
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-landing-text-muted">
              <p>
                Because freedom is free. But distributing it is not.
              </p>
              <ul className="space-y-2 border-l border-landing-border pl-4">
                <li>• <strong>Every book</strong> requires writing, editing, formatting, publishing, hosting, and maintenance.</li>
                <li>• <strong>Every audiobook</strong> requires narration, processing, storage, bandwidth, and ongoing platform resources.</li>
                <li>• <strong>Every video, documentary, article, and resource</strong> requires time, effort, and infrastructure.</li>
              </ul>
              <p>
                One Man Revolution is not funded by large corporations, advertising networks, government grants, political organizations, or institutional sponsors. It is sustained by ordinary people who believe the mission should continue.
              </p>
              <div className="pt-4 space-y-2">
                <p className="font-semibold text-landing-text">Your support allows us to:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">• Publish more books.</div>
                  <div className="flex items-center gap-2">• Produce more narrated content.</div>
                  <div className="flex items-center gap-2">• Translate content into languages.</div>
                  <div className="flex items-center gap-2">• Create documentaries & resources.</div>
                  <div className="flex items-center gap-2">• Maintain & improve the platform.</div>
                  <div className="flex items-center gap-2">• Reach more people globally.</div>
                </div>
              </div>
              <p className="pt-4 border-t border-landing-border font-crimson text-lg italic text-landing-text text-center">
                "Support is not payment for information. Support is participation in the mission."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Model Breakdown Section */}
      <section className="page-container py-12">
        <div className="mx-auto max-w-5xl space-y-8">
          <h2 className="font-playfair text-3xl font-semibold text-center text-landing-text">
            How The Platform Works
          </h2>
          <p className="text-center text-landing-text-muted max-w-xl mx-auto">
            Choose how you want to participate in the mission. Our structure keeps the primary library free while giving supporters access to narrated formats.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 items-stretch">
            {/* Free Access */}
            <div className="surface-card p-6 flex flex-col justify-between border border-landing-border/80">
              <div className="space-y-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-landing-accent/10 text-landing-accent">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="font-playfair text-xl font-semibold text-landing-text">Free Access</h3>
                <p className="text-xs uppercase tracking-wider text-landing-text-muted font-semibold">The Foundation</p>
                <p className="text-sm text-landing-text-muted leading-relaxed">
                  To make awakening information available to as many people as possible. No one should be excluded from the conversation because of money.
                </p>
                <ul className="text-xs text-landing-text-muted space-y-1.5 pt-2">
                  <li>✔ Free books</li>
                  <li>✔ Articles & Essays</li>
                  <li>✔ Videos & Documentary pieces</li>
                  <li>✔ Educational content</li>
                  <li>✔ Public resources</li>
                </ul>
              </div>
              <div className="pt-6">
                <div className="w-full text-center py-2.5 text-xs font-semibold uppercase tracking-wider text-landing-text-muted bg-landing-bg-secondary rounded-xl">
                  Always Open
                </div>
              </div>
            </div>

            {/* Supporters */}
            <div className="surface-card p-6 flex flex-col justify-between border border-landing-accent/20 ring-1 ring-landing-accent/5">
              <div className="space-y-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-landing-accent/15 text-landing-accent">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <h3 className="font-playfair text-xl font-semibold text-landing-text">Supporters</h3>
                <p className="text-xs uppercase tracking-wider text-landing-accent font-semibold">Once-off Contribution</p>
                <p className="text-sm text-landing-text-muted leading-relaxed">
                  Help fund the distribution and creation of resources. As a thank-you, supporters receive access to narrated versions and special editions.
                </p>
                <ul className="text-xs text-landing-text-muted space-y-1.5 pt-2">
                  <li>✔ Narrated audiobooks</li>
                  <li>✔ Supporter-exclusive releases</li>
                  <li>✔ Special book editions</li>
                  <li>✔ Additional educational material</li>
                </ul>
              </div>
              <div className="pt-6">
                <DonationSection
                  currentUserEmail={currentUserEmail}
                  triggerVariant="button"
                  triggerLabel="Become a Supporter"
                  initialFrequency="ONE_TIME"
                  triggerClassName="brand-button w-full py-3 text-sm shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                  modalTitle="Become a Supporter"
                  modalDescription="Support the mission with a once-off contribution. Your contribution funds translations, hosting, and platform expansion."
                  modalBadgeLabel="Once-off Support"
                />
              </div>
            </div>

            {/* Sustainers */}
            <div className="surface-card p-6 flex flex-col justify-between border border-emerald-500/20 ring-1 ring-emerald-500/5">
              <div className="space-y-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-playfair text-xl font-semibold text-landing-text">Sustainers</h3>
                <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">Monthly Contribution</p>
                <p className="text-sm text-landing-text-muted leading-relaxed">
                  The foundation upon which the future is built. Monthly support allows long-term planning and new resources without dependence on outside interests.
                </p>
                <ul className="text-xs text-landing-text-muted space-y-1.5 pt-2">
                  <li>✔ All Supporter benefits</li>
                  <li>✔ Sustainer-exclusive books</li>
                  <li>✔ Early access to new releases</li>
                  <li>✔ Premium future content & audio</li>
                </ul>
              </div>
              <div className="pt-6">
                <DonationSection
                  currentUserEmail={currentUserEmail}
                  triggerVariant="button"
                  triggerLabel="Become a Sustainer"
                  initialFrequency="MONTHLY"
                  triggerClassName="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 w-full shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                  modalTitle="Become a Sustainer"
                  modalDescription="Carry the mission forward month after month. Cancel or update your contribution frequency at any time."
                  modalBadgeLabel="Monthly Sustainer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Are Building */}
      <section className="page-container py-16">
        <div className="mx-auto max-w-3xl surface-muted p-8 sm:p-12 space-y-6">
          <h2 className="font-playfair text-2xl font-semibold text-center text-landing-text">
            What We Are Building
          </h2>
          <div className="space-y-4 text-center text-landing-text-muted max-w-xl mx-auto leading-relaxed">
            <p className="font-semibold text-landing-text text-lg">
              We are not building a bookstore. We are not building a content platform. We are building a living library.
            </p>
            <p>
              A place where knowledge can be preserved, expanded, and shared freely. A place where individuals can access information, challenge assumptions, and continue their journey of discovery.
            </p>
            <p className="text-xs uppercase tracking-[0.16em] text-landing-accent font-semibold pt-4">
              Every book added · Every audiobook produced · Every documentary released · Every reader reached · Moves the mission forward.
            </p>
          </div>
        </div>
      </section>

      {/* A Personal Note */}
      <section className="page-container pb-20">
        <div className="mx-auto max-w-3xl surface-card p-8 sm:p-12 space-y-6">
          <h2 className="font-playfair text-2xl font-semibold text-landing-text text-center">
            A Personal Note
          </h2>
          <div className="space-y-6 text-base leading-relaxed text-landing-text-muted">
            <p>
              If all you ever do is read the free content, we are grateful that you are here. The mission remains the same:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 font-playfair text-lg font-semibold italic text-landing-text py-2">
              <span>Read.</span>
              <span>Learn.</span>
              <span>Question.</span>
              <span>Think.</span>
              <span>Share.</span>
            </div>
            <p>
              If, however, you believe this work has value and should continue to grow, we invite you to become a supporter. Not because information should be sold, but because missions worth preserving require people willing to sustain them.
            </p>
            <p>
              Together, we can keep this library growing, keep this knowledge available, and continue reaching those who are searching.
            </p>
            <p className="font-semibold text-center text-landing-text pt-4">
              Thank you for being part of the journey.
            </p>
            <div className="text-center font-playfair text-lg font-bold text-landing-accent border-t border-landing-border/60 pt-6">
              Support the Mission. Expand the Library. Empower the Individual.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
