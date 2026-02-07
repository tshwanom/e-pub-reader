'use client';

import { useState } from 'react';

interface DonationSectionProps {
  bookId: string;
  bookTitle: string;
  message?: string | null;
  goal?: any; // Decimal type from Prisma
}

export default function DonationSection({
  bookId,
  bookTitle,
  message,
  goal,
}: DonationSectionProps) {
  const [amount, setAmount] = useState('10');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleDonate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          amount: parseFloat(amount),
        }),
      });

      if (res.ok) {
        const { approvalUrl } = await res.json();
        // Redirect to PayPal
        window.location.href = approvalUrl;
      } else {
        alert('Failed to initiate donation');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow p-6 border border-purple-100">
      <h2 className="text-2xl font-bold text-gray-900 mb-3">
        Support This Book
      </h2>

      {message && (
        <p className="text-gray-700 mb-4 leading-relaxed whitespace-pre-wrap">
          {message}
        </p>
      )}

      {goal && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Funding Goal</span>
            <span>${Number(goal).toFixed(2)}</span>
          </div>
          {/* TODO: Show actual progress from donations */}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        {['5', '10', '25', '50'].map((preset) => (
          <button
            key={preset}
            onClick={() => setAmount(preset)}
            className={`flex-1 py-2 rounded-lg font-semibold transition ${
              amount === preset
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            ${preset}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="1"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Custom amount"
          />
        </div>
        <button
          onClick={handleDonate}
          disabled={loading || !amount || parseFloat(amount) < 1}
          className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Donate'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-3 text-center">
        Secure payment powered by PayPal
      </p>
    </div>
  );
}
