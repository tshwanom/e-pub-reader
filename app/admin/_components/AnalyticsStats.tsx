export default function AnalyticsStats({
  totalUsers,
  totalBooks,
  totalDonations,
  activeReaders,
}: {
  totalUsers: number;
  totalBooks: number;
  totalDonations: number;
  activeReaders: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium">Total Readers</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{totalUsers}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium">Active Readers (30d)</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{activeReaders}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium">Total Donations</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">${totalDonations.toFixed(2)}</p>
      </div>
       <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-500 text-sm font-medium">Total Books</h3>
        <p className="text-3xl font-bold text-gray-900 mt-2">{totalBooks}</p>
      </div>
    </div>
  );
}
