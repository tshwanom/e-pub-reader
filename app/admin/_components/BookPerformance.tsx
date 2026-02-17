
export default function BookPerformance({
  books,
}: {
  books: {
    id: string;
    title: string;
    readers: number;
    completions: number;
    donations: number;
    revenue: number;
  }[];
}) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-gray-500 text-sm font-medium mb-4">Book Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3">Title</th>
               <th scope="col" className="px-6 py-3">Readers</th>
               <th scope="col" className="px-6 py-3">Completions</th>
               <th scope="col" className="px-6 py-3">Donations</th>
               <th scope="col" className="px-6 py-3">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className="bg-white border-b hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                  {book.title}
                </td>
                <td className="px-6 py-4">{book.readers}</td>
                <td className="px-6 py-4">{book.completions}</td>
                <td className="px-6 py-4">{book.donations}</td>
                <td className="px-6 py-4">${book.revenue.toFixed(2)}</td>
              </tr>
            ))}
             {books.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4">No books found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
