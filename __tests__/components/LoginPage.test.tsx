import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';
import { signIn } from 'next-auth/react';
import { redirectToMagicLoginCallback } from '@/lib/magic-login';

const pushMock = jest.fn();
const searchParams = new URLSearchParams('callbackUrl=%2Flibrary');

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => searchParams,
}));

jest.mock('@/lib/magic-login', () => {
  const actual = jest.requireActual('@/lib/magic-login');

  return {
    ...actual,
    redirectToMagicLoginCallback: jest.fn(),
  };
});

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;
const mockRedirectToMagicLoginCallback = redirectToMagicLoginCallback as jest.MockedFunction<
  typeof redirectToMagicLoginCallback
>;

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams.delete('error');
    mockSignIn.mockResolvedValue({ ok: true, status: 200, error: null, url: null });
  });

  it('requests a passwordless sign-in email for the donor email address', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email address/i), 'Reader@example.com');
    await user.click(screen.getByRole('button', { name: /Send magic link or code/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('email', {
        redirect: false,
        email: 'reader@example.com',
        callbackUrl: '/library',
      });
    });

    expect(screen.getByText(/We sent a magic link and a 6-digit code to reader@example.com/i)).toBeInTheDocument();
  });

  it('redirects to the NextAuth email callback when a code is entered', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email address/i), 'reader@example.com');
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /Sign in with code/i }));

    expect(mockRedirectToMagicLoginCallback).toHaveBeenCalledWith(
      '/api/auth/callback/email?email=reader%40example.com&token=123456&callbackUrl=%2Flibrary'
    );
  });

  it('still supports password sign-in as a fallback', async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    const emailInputs = screen.getAllByRole('textbox', { name: /Email/i });
    await user.type(emailInputs[1], 'reader@example.com');
    await user.type(screen.getByLabelText(/^Password$/i), 'secret');
    await user.click(screen.getByRole('button', { name: /Sign in with password/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        redirect: false,
        email: 'reader@example.com',
        password: 'secret',
      });
    });

    expect(pushMock).toHaveBeenCalledWith('/library');
  });

  it('shows a friendly verification error when the link or code expired', () => {
    searchParams.set('error', 'Verification');

    render(<LoginPage />);

    expect(screen.getByText(/That link or code is invalid or has expired/i)).toBeInTheDocument();
  });
});
