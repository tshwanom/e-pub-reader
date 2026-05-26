import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const apiKey = process.env.RESEND_API_KEY?.trim();
const from   = process.env.RESEND_FROM_EMAIL?.trim();
const to     = 'phaxym@gmail.com';

console.log('RESEND_API_KEY :', apiKey ? `${apiKey.slice(0, 8)}…` : '❌ MISSING');
console.log('RESEND_FROM_EMAIL:', from || '❌ MISSING');
console.log('Sending to       :', to);

if (!apiKey || !from) {
  console.error('\n❌ Config missing – aborting.');
  process.exit(1);
}

const { Resend } = await import('resend');
const resend = new Resend(apiKey);

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: '✅ One Man Revolution – email delivery test',
  html: `
    <div style="font-family:Inter,Arial,sans-serif;padding:32px;background:#f4f6f7;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #d8e0e4;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#3D737A;">Email delivery test</p>
        <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;color:#111827;">It works! 🎉</h1>
        <p style="color:#5f6b76;font-size:15px;line-height:1.7;">
          Your Resend configuration is working correctly.<br/>
          Magic-link sign-in emails will now be delivered to your readers.
        </p>
      </div>
    </div>
  `,
  text: 'Email delivery test passed. Your Resend configuration is working correctly.',
});

if (error) {
  console.error('\n❌ Resend error:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('\n✅ Email sent! Resend ID:', data?.id);
