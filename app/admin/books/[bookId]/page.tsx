'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';

interface PrintLink {
  id?: string;
  provider: string;
  url: string;
  format: string;
}

interface BookForm {
  title: string;
  author: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  donationEnabled: boolean;
  donationMessage?: string;
  donationGoal?: number;
  amazonKdpUrl?: string;
  printLinks: PrintLink[];
}

export default function EditBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookId, setBookId] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [extractingCover, setExtractingCover] = useState(false);
  
  const { register, handleSubmit, reset, control } = useForm<BookForm>({
    defaultValues: {
      printLinks: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'printLinks',
  });

  useEffect(() => {
    params.then((p) => {
      setBookId(p.bookId);
      fetchBook(p.bookId);
    });
  }, []);

  const fetchBook = async (id: string) => {
    try {
      const res = await fetch(`/api/books/${id}?include=printLinks`);
      if (!res.ok) throw new Error('Failed to fetch book');
      const data = await res.json();
      reset({
        title: data.title,
        author: data.author,
        description: data.description,
        status: data.status,
        donationEnabled: data.donationEnabled || false,
        donationMessage: data.donationMessage || '',
        donationGoal: data.donationGoal ? Number(data.donationGoal) : undefined,
        amazonKdpUrl: data.amazonKdpUrl || '',
        printLinks: data.printLinks || [],
      });
      setCoverUrl(data.coverUrl);
    } catch (err) {
      setError('Could not load book details');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: BookForm) => {
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update book');
      
      router.push('/admin/books');
      router.refresh();
    } catch (err) {
      alert('Failed to update book');
    }
  };

  const extractCover = async () => {
    setExtractingCover(true);
    try {
      const res = await fetch(`/api/books/${bookId}/extract-cover`, {
        method: 'POST',
      });

      if (res.ok) {
        const { coverUrl: newCoverUrl } = await res.json();
        setCoverUrl(newCoverUrl);
        alert('Cover extracted successfully!');
      } else {
        const error = await res.json();
        alert(`Failed to extract cover: ${error.details || error.error}`);
      }
    } catch (err) {
      alert('Error extracting cover');
    } finally {
      setExtractingCover(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this book? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete book');

      router.push('/admin/books');
      router.refresh();
    } catch (err) {
      alert('Failed to delete book');
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Edit Book</h1>
        <button
          onClick={handleDelete}
          className="bg-red-100 text-red-600 px-4 py-2 rounded hover:bg-red-200 transition"
        >
          Delete Book
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Cover Section */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Cover Image</h2>
          <div className="flex gap-4 items-start">
            <div className="w-32 h-48 bg-gray-100 rounded overflow-hidden flex-shrink-0">
              {coverUrl && coverUrl !== '/placeholder-cover.jpg' ? (
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No Cover
                </div>
              )}
            </div>
            <div className="flex-1">
              <button
                type="button"
                onClick={extractCover}
                disabled={extractingCover}
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {extractingCover ? 'Extracting...' : 'Extract from EPUB'}
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Extract the cover image from the uploaded EPUB file
              </p>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              {...register('title', { required: true })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
            <input
              {...register('author', { required: true })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              {...register('status')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 bg-white"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        {/* Monetization */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-lg font-semibold mb-4">Monetization</h2>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              {...register('donationEnabled')}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-700">
              Enable donations for this book
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Donation Message
            </label>
            <textarea
              {...register('donationMessage')}
              rows={3}
              placeholder="Explain why readers should support this book..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Donation Goal (USD)
            </label>
            <input
              type="number"
              step="0.01"
              {...register('donationGoal')}
              placeholder="e.g., 1000"
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Print-on-Demand */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <h2 className="text-lg font-semibold mb-4">Print-on-Demand</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amazon KDP URL
            </label>
            <input
              type="url"
              {...register('amazonKdpUrl')}
              placeholder="https://www.amazon.com/dp/..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Other Print Providers
              </label>
              <button
                type="button"
                onClick={() => append({ provider: '', url: '', format: 'PAPERBACK' })}
                className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200"
              >
                + Add Provider
              </button>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-3 mb-3 p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <input
                    {...register(`printLinks.${index}.provider` as const)}
                    placeholder="Provider name (e.g., IngramSpark)"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <input
                    {...register(`printLinks.${index}.url` as const)}
                    placeholder="https://..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-32">
                  <select
                    {...register(`printLinks.${index}.format` as const)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="PAPERBACK">Paperback</option>
                    <option value="HARDCOVER">Hardcover</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-red-600 hover:text-red-800 px-2"
                >
                  ✕
                </button>
              </div>
            ))}

            {fields.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No additional print providers configured
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded hover:bg-gray-200 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
