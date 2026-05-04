/**
 * Supabase Edge Function: send-trade-email
 *
 * Triggered by Database Webhooks on:
 *   - trade_offers INSERT (status = 'proposed')
 *   - trade_messages INSERT
 *
 * Sends an email via Resend to the recipient if they have email_notifications enabled.
 *
 * Environment variables required:
 *   RESEND_API_KEY     — Resend API key (free tier: 100 emails/day)
 *   SUPABASE_URL       — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *   APP_URL            — e.g. https://kepler.example.com
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: Record<string, unknown>;
  old_record: null;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Kepler <noreply@kepler.trade>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Resend error:', res.status, text);
  }
  return res.ok;
}

async function getRecipientEmail(userId: string): Promise<{ email: string; enabled: boolean } | null> {
  // Check profile preference
  const { data: profile } = await supabase
    .from('profiles')
    .select('email_notifications')
    .eq('id', userId)
    .single();

  if (!profile?.email_notifications) return null;

  // Get email from auth.users
  const { data: { user } } = await supabase.auth.admin.getUserById(userId);
  if (!user?.email) return null;

  return { email: user.email, enabled: true };
}

serve(async (req) => {
  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
    }

    const payload: WebhookPayload = await req.json();
    const { table, record } = payload;

    if (table === 'trade_offers' && record.status === 'proposed') {
      const recipientId = record.recipient_id as string;
      const tradeId = record.id as string;

      const recipient = await getRecipientEmail(recipientId);
      if (!recipient) {
        return new Response(JSON.stringify({ skipped: 'notifications disabled or no email' }), { status: 200 });
      }

      // Get initiator username
      const { data: initiator } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', record.initiator_id)
        .single();

      const initiatorName = initiator?.username ?? 'Someone';

      await sendEmail(
        recipient.email,
        `${initiatorName} wants to trade with you on Kepler`,
        `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #111;">New Trade Offer</h2>
          <p><strong>${initiatorName}</strong> has proposed a trade with you on Kepler.</p>
          <a href="${APP_URL}/trades/${tradeId}"
             style="display: inline-block; background: #111; color: #fff; padding: 12px 24px;
                    border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 12px;">
            View Trade
          </a>
          <p style="color: #888; font-size: 12px; margin-top: 24px;">
            You received this because you enabled email notifications on Kepler.
            <br>You can disable them in your profile settings.
          </p>
        </div>
        `
      );

      return new Response(JSON.stringify({ sent: true }), { status: 200 });
    }

    if (table === 'trade_messages') {
      const senderId = record.sender_id as string;
      const tradeId = record.trade_id as string;

      // Get the trade to find the other participant
      const { data: trade } = await supabase
        .from('trade_offers')
        .select('initiator_id, recipient_id')
        .eq('id', tradeId)
        .single();

      if (!trade) {
        return new Response(JSON.stringify({ skipped: 'trade not found' }), { status: 200 });
      }

      const recipientId = trade.initiator_id === senderId ? trade.recipient_id : trade.initiator_id;

      const recipient = await getRecipientEmail(recipientId);
      if (!recipient) {
        return new Response(JSON.stringify({ skipped: 'notifications disabled' }), { status: 200 });
      }

      const { data: sender } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', senderId)
        .single();

      const senderName = sender?.username ?? 'Someone';

      await sendEmail(
        recipient.email,
        `New message from ${senderName} on Kepler`,
        `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #111;">New Trade Message</h2>
          <p><strong>${senderName}</strong> sent you a message in your trade.</p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 12px 16px; margin: 12px 0; color: #333;">
            ${record.content}
          </div>
          <a href="${APP_URL}/trades/${tradeId}"
             style="display: inline-block; background: #111; color: #fff; padding: 12px 24px;
                    border-radius: 6px; text-decoration: none; font-weight: 600;">
            Reply
          </a>
          <p style="color: #888; font-size: 12px; margin-top: 24px;">
            You received this because you enabled email notifications on Kepler.
          </p>
        </div>
        `
      );

      return new Response(JSON.stringify({ sent: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ skipped: 'unhandled event' }), { status: 200 });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
