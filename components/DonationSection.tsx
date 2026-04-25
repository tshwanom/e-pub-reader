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
    <div className="surface-card p-6 sm:p-8">
      <h2 className="font-playfair text-3xl font-semibold text-landing-text mb-2">
        Support “{bookTitle}”
      </h2>
      <p className="text-sm text-landing-text-muted mb-5">
        Help keep the library independent and fund future releases.
      </p>

      {message && (
        <p className="mb-4 whitespace-pre-wrap leading-relaxed text-landing-text-muted">
          {message}
        </p>
      )}

      {goal && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm text-landing-text-muted">
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
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              amount === preset
                ? 'bg-landing-accent text-white'
                : 'border border-landing-border bg-white text-landing-text hover:border-landing-accent/40 hover:text-landing-accent'
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
            className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
            placeholder="Custom amount"
          />
        </div>
        <button
          onClick={handleDonate}
          disabled={loading || !amount || parseFloat(amount) < 1}
          className="brand-button px-8 py-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Processing...' : 'Donate'}
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-landing-text-muted">
        Secure payment powered by PayPal
      </p>
    </div>
  );
}
