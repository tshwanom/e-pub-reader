import { render, screen } from '@testing-library/react';
import PaystackSubscriptionManager from '@/components/PaystackSubscriptionManager';

const subscription = {
  id: 'donation-1',
  donorEmail: 'reader@example.com',
  gatewayAmount: 182.5,
  gatewayCurrency: 'ZAR',
  paystackSubscriptionCode: 'SUB_123',
  createdAt: new Date('2026-05-22T10:00:00.000Z'),
  book: {
    id: 'book-1',
    title: 'Test Book',
  },
};

describe('PaystackSubscriptionManager', () => {
  it('renders the core management actions for an active recurring Paystack supporter', () => {
    render(
      <PaystackSubscriptionManager
        subscription={subscription}
        returnTo="/library"
      />
    );

    expect(screen.getByRole('heading', { name: /Manage your recurring support/i })).toBeInTheDocument();
    expect(screen.getByText(/Update your saved card or cancel the subscription/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Update card or cancel on Paystack/i })).toHaveAttribute(
      'href',
      '/api/donations/paystack/manage?returnTo=%2Flibrary&donationId=donation-1'
    );
    expect(screen.getByRole('button', { name: /Email me the secure link/i })).toBeInTheDocument();
    expect(screen.getByText(/Started from “Test Book”/i)).toBeInTheDocument();
  });

  it('shows a success flash when the manage email was sent', () => {
    render(
      <PaystackSubscriptionManager
        subscription={subscription}
        returnTo="/library"
        status="manage-email-sent"
      />
    );

    expect(screen.getByText(/A secure Paystack management link is on its way to your inbox/i)).toBeInTheDocument();
  });
});
