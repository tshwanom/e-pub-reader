import {
  Activity,
  AudioLines,
  BookCopy,
  CircleDollarSign,
  LockKeyhole,
  Users,
} from "lucide-react";
import { formatCurrencyAmount } from '@/lib/donations';

export default function AnalyticsStats({
  totalUsers,
  totalBooks,
  totalDonations,
  activeReaders,
  donorOnlyBooks,
  readyNarratedBooks,
}: {
  totalUsers: number;
  totalBooks: number;
  totalDonations: number;
  activeReaders: number;
  donorOnlyBooks: number;
  readyNarratedBooks: number;
}) {
  const cards = [
    {
      label: "Total readers",
      value: totalUsers.toLocaleString(),
      hint: "Accounts with reader access",
      icon: Users,
    },
    {
      label: "Active readers (30d)",
      value: activeReaders.toLocaleString(),
      hint: "Readers with recent progress",
      icon: Activity,
    },
    {
      label: "Donation revenue (USD)",
      value: formatCurrencyAmount(totalDonations, 'USD'),
      hint: "Completed contributions normalized to USD",
      icon: CircleDollarSign,
    },
    {
      label: "Books in catalog",
      value: totalBooks.toLocaleString(),
      hint: "Drafts and published titles",
      icon: BookCopy,
    },
    {
      label: "Supporter-only books",
      value: donorOnlyBooks.toLocaleString(),
      hint: "Premium access titles",
      icon: LockKeyhole,
    },
    {
      label: "Ready narrations",
      value: readyNarratedBooks.toLocaleString(),
      hint: "Books with active READY audio",
      icon: AudioLines,
    },
  ];

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article key={card.label} className="surface-card min-w-0 p-5 sm:p-6">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-landing-text">{card.value}</p>
                <p className="mt-2 text-sm text-landing-text-muted">{card.hint}</p>
              </div>
              <span className="rounded-2xl bg-landing-accent/10 p-3 text-landing-accent">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
