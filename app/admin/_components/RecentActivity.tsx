export default function RecentActivity({
  recentDonations,
  recentUsers,
}: {
  recentDonations: any[];
  recentUsers: any[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium mb-4">Recent Donations</h3>
        <div className="space-y-4">
          {recentDonations.map((donation) => (
            <div key={donation.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                  {donation.user?.name?.[0] || "A"}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">
                    {donation.user?.name || "Anonymous"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {donation.user?.email || "No email"}
                  </p>
                </div>
              </div>
              <div className="font-medium">
                +${Number(donation.amount).toFixed(2)}
              </div>
            </div>
          ))}
          {recentDonations.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No recent donations</p>
          )}
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium mb-4">Recent Readers</h3>
        <div className="space-y-4">
           {recentUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                  {user.name?.[0] || "U"}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">
                    {user.name || "Unknown User"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {recentUsers.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No recent readers</p>
          )}
        </div>
      </div>
    </div>
  );
}
