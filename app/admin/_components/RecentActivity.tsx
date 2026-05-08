import { formatCurrencyAmount, formatDonationGatewayLabel } from '@/lib/donations';

export default function RecentActivity({
  recentDonations,
  recentUsers,
}: {
  recentDonations: any[];
  recentUsers: any[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="surface-card min-w-0 p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Recent donations</p>
          <h3 className="mt-2 text-lg font-semibold text-landing-text">Latest supporters funding the library</h3>
        </div>
        <div className="space-y-4">
          {recentDonations.map((donation) => (
            <div key={donation.id} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-white/65">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-accent/10 text-sm font-medium text-landing-accent">
                  {donation.user?.name?.[0] || donation.donorEmail?.[0]?.toUpperCase() || "A"}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none text-landing-text">
                    {donation.user?.name || "Anonymous"}
                  </p>
                  <p className="text-xs text-landing-text-muted">
                    {donation.user?.email || donation.donorEmail || "No email"}
                    {donation.gateway ? ` • ${formatDonationGatewayLabel(donation.gateway)}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-landing-text">
                  +{formatCurrencyAmount(Number(donation.amount), 'USD')}
                </div>
                {donation.donorAmount && donation.donorCurrency && donation.donorCurrency !== 'USD' ? (
                  <p className="text-xs text-landing-text-muted">
                    from {formatCurrencyAmount(Number(donation.donorAmount), donation.donorCurrency)}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {recentDonations.length === 0 && (
            <p className="py-4 text-center text-sm text-landing-text-muted">No recent donations</p>
          )}
        </div>
      </div>
      <div className="surface-card min-w-0 p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Recent readers</p>
          <h3 className="mt-2 text-lg font-semibold text-landing-text">Newest accounts discovering the catalog</h3>
        </div>
        <div className="space-y-4">
           {recentUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-white/65">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-accent/10 text-sm font-medium text-landing-accent">
                  {user.name?.[0] || "U"}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none text-landing-text">
                    {user.name || "Unknown User"}
                  </p>
                  <p className="text-xs text-landing-text-muted">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="text-xs text-landing-text-muted">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {recentUsers.length === 0 && (
            <p className="py-4 text-center text-sm text-landing-text-muted">No recent readers</p>
          )}
        </div>
      </div>
    </div>
  );
}
