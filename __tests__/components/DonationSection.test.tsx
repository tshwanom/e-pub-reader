'use client';

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DonationSection from '@/components/DonationSection';

describe('DonationSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response) as jest.Mock;
  });

  it('posts the default PayPal + USD donation payload', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await user.click(screen.getByRole('button', { name: /Continue to PayPal/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({
      bookId: 'book-1',
      amount: 10,
      currency: 'USD',
      gateway: 'PAYPAL',
    });
  });

  it('requires an email before starting a guest Paystack checkout', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await user.click(screen.getAllByRole('button', { name: /Paystack/i })[0]);
    const continueButton = screen.getByRole('button', { name: /Continue to Paystack/i });

    expect(screen.getByLabelText(/Email for Paystack/i)).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('includes the selected Paystack gateway and donor email in the request body', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await user.click(screen.getAllByRole('button', { name: /Paystack/i })[0]);
    await user.type(screen.getByLabelText(/Email for Paystack/i), 'reader@example.com');
    await user.clear(screen.getByLabelText(/Amount in USD/i));
    await user.type(screen.getByLabelText(/Amount in USD/i), '15');
    await user.click(screen.getByRole('button', { name: /Continue to Paystack/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      bookId: 'book-1',
      amount: 15,
      currency: 'USD',
      gateway: 'PAYSTACK',
      donorEmail: 'reader@example.com',
    });
  });
});