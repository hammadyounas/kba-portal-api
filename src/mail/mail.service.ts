import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: AppConfigService) {}

  async sendStaffInvite(input: {
    to: string;
    fullName: string;
    inviteUrl: string;
  }): Promise<void> {
    const user = this.config.get('GMAIL_USER');
    const pass = this.config.get('GMAIL_APP_PASSWORD')?.replace(/\s/g, '');
    if (!user || !pass) {
      throw new Error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    try {
      await transporter.sendMail({
        from: `KBA Archive <${user}>`,
        to: input.to,
        subject: 'You are invited to the KBA archive',
        text: plainInvite(input),
        html: htmlInvite(input),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gmail rejected the invitation';
      this.logger.error(`Gmail rejected staff invite for ${input.to}: ${message}`);
      throw new Error(message);
    }
  }
}

function plainInvite(input: { fullName: string; inviteUrl: string }) {
  return [
    `Hello ${input.fullName},`,
    '',
    'An administrator invited you to join the Karachi Bar Association archive as staff.',
    'Open the link below to set your password and finish registration:',
    input.inviteUrl,
    '',
    'This link expires in 7 days.',
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n');
}

function htmlInvite(input: { fullName: string; inviteUrl: string }) {
  const name = escapeHtml(input.fullName);
  const url = escapeHtml(input.inviteUrl);
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f1e7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f2;border:1px solid #e4dccb;border-radius:10px;">
            <tr>
              <td style="background:#0f2a24;padding:28px 32px;">
                <p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8893b;">Karachi Bar Association</p>
                <h1 style="margin:12px 0 0;font-family:Georgia,serif;font-size:28px;line-height:1.2;font-weight:600;color:#fbf8f2;">You are invited</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Georgia,serif;color:#1e1e1c;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hello ${name},</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1e1e1c;">An administrator invited you to join the archive as staff. Open the link, set your password, and your account will be ready.</p>
                <a href="${url}" style="display:inline-block;background:#0f2a24;color:#fbf8f2;text-decoration:none;font-family:Georgia,serif;font-size:15px;font-weight:600;padding:12px 18px;border-radius:6px;">Set your password</a>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6b6a64;">This invitation expires in 7 days. If you were not expecting it, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
