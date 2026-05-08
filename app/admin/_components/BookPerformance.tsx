
import { formatCurrencyAmount } from '@/lib/donations';

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
    <div className="surface-card p-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Book performance</p>
        <h3 className="mt-2 text-lg font-semibold text-landing-text">Reading and support trends by title</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-landing-text-muted">
          <thead className="bg-white/80 text-xs uppercase tracking-[0.16em] text-landing-text-muted">
            <tr>
              <th scope="col" className="px-6 py-3">Title</th>
               <th scope="col" className="px-6 py-3">Readers</th>
               <th scope="col" className="px-6 py-3">Completions</th>
               <th scope="col" className="px-6 py-3">Donations</th>
               <th scope="col" className="px-6 py-3">Revenue (USD)</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className="border-b border-landing-border/60 bg-white/50 transition-colors hover:bg-white/80">
                <td className="whitespace-nowrap px-6 py-4 font-medium text-landing-text">
                  {book.title}
                </td>
                <td className="px-6 py-4">{book.readers}</td>
                <td className="px-6 py-4">{book.completions}</td>
                <td className="px-6 py-4">{book.donations}</td>
                <td className="px-6 py-4">{formatCurrencyAmount(book.revenue, 'USD')}</td>
              </tr>
            ))}
             {books.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-landing-text-muted">No books found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
