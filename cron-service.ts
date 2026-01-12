/**
 * Cron Service for Finance Tracker Backend
 * Processes emails and syncs transactions to Google Sheets
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { decrypt } from './lib/encryption';
import { parseHDFCEmail, type ParsedTransaction } from './lib/email-parser';

config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface User {
  id: string;
  google_email: string;
  google_access_token: string;
  google_refresh_token: string;
  google_sheet_id: string | null;
  last_processed_email_timestamp: string | null;
  is_processing: boolean;
  is_active: boolean;
  missed_emails: any[];
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Token refresh failed:', data);
      return null;
    }

    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

async function processUser(user: User): Promise<{ transactions: number; missed: number } | null> {
  const userStart = new Date();
  console.log(`🔐 Processing user: ${user.google_email}`);

  if (!user.google_sheet_id) {
    console.log(`⏭️  Skipping - No Google Sheet configured`);
    return { transactions: 0, missed: 0 };
  }

  if (user.is_processing) {
    console.log(`⏭️  Skipping - User already being processed`);
    return { transactions: 0, missed: 0 };
  }

  await supabase.from('users').update({ is_processing: true }).eq('id', user.id);

  try {
    const refreshToken = decrypt(user.google_refresh_token);
    const accessToken = await refreshAccessToken(refreshToken);

    if (!accessToken) {
      console.error(`❌ Token refresh failed`);
      await supabase
        .from('users')
        .update({ is_active: false, is_processing: false })
        .eq('id', user.id);
      return null;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    let query = 'from:alerts@hdfcbank.net (credited OR debited OR UPI OR transaction)';
    const lastProcessed = user.last_processed_email_timestamp;

    if (lastProcessed) {
      const timestamp = Math.floor(new Date(lastProcessed).getTime() / 1000);
      query += ` after:${timestamp}`;
    }

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = listResponse.data.messages || [];
    console.log(`📬 Found ${messages.length} emails`);

    if (messages.length === 0) {
      await supabase
        .from('users')
        .update({ is_processing: false, last_sync_time: new Date().toISOString() })
        .eq('id', user.id);
      return { transactions: 0, missed: 0 };
    }

    const existingRefs = new Set<string>();
    try {
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: user.google_sheet_id,
        range: 'Transactions!G2:G',
      });
      (sheetData.data.values || []).forEach(row => {
        if (row[0]) existingRefs.add(row[0]);
      });
    } catch (e) {
      console.warn(`⚠️  Could not fetch existing transactions`);
    }

    const newTransactions: ParsedTransaction[] = [];
    const missedEmails: any[] = [];
    let latestTimestamp: Date | null = null;

    for (const message of messages) {
      try {
        const msgResponse = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });

        const msg = msgResponse.data;
        const headers = msg.payload?.headers || [];

        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value;
        const receivedDate = dateHeader ? new Date(dateHeader) : new Date(parseInt(msg.internalDate || '0'));

        let body = '';
        if (msg.payload?.body?.data) {
          body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
        } else if (msg.payload?.parts) {
          for (const part of msg.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
              break;
            }
          }
        }

        const result = parseHDFCEmail(body, subject, receivedDate, message.id!);

        if (result.success && result.transaction) {
          if (!existingRefs.has(result.transaction.referenceNumber)) {
            newTransactions.push(result.transaction);
            existingRefs.add(result.transaction.referenceNumber);
          }
        } else {
          missedEmails.push({
            email_id: message.id,
            subject,
            body_snippet: body.substring(0, 200),
            received_date: receivedDate.toISOString(),
            from: 'alerts@hdfcbank.net',
          });
        }

        if (!latestTimestamp || receivedDate > latestTimestamp) {
          latestTimestamp = receivedDate;
        }
      } catch (emailError) {
        console.error(`❌ Error processing email:`, emailError);
      }
    }

    if (newTransactions.length > 0) {
      console.log(`💾 Saving ${newTransactions.length} transactions`);

      const values = newTransactions.map(t => [
        t.dateTime,
        t.amount,
        t.type,
        t.method,
        t.account,
        t.description,
        t.referenceNumber,
        t.availableBalance,
        t.category,
        t.notes,
        t.emailReceivedDate,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: user.google_sheet_id,
        range: 'Transactions!A:K',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    }

    if (latestTimestamp) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: user.google_sheet_id,
          range: 'Metadata!B2',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[latestTimestamp.toISOString()]] },
        });
      } catch (metaError) {
        console.warn(`⚠️  Failed to update metadata`);
      }
    }

    const currentMissed = user.missed_emails || [];
    await supabase
      .from('users')
      .update({
        last_processed_email_timestamp: latestTimestamp?.toISOString() || user.last_processed_email_timestamp,
        last_sync_time: new Date().toISOString(),
        is_processing: false,
        missed_emails: [...currentMissed, ...missedEmails].slice(-50),
      })
      .eq('id', user.id);

    const userDuration = new Date().getTime() - userStart.getTime();
    console.log(`✅ Completed in ${Math.floor(userDuration / 1000)}s`);

    return { transactions: newTransactions.length, missed: missedEmails.length };

  } catch (error) {
    console.error(`💥 Error:`, error);
    await supabase.from('users').update({ is_processing: false }).eq('id', user.id);
    return null;
  }
}

export async function runCron() {
  const cronStart = new Date();
  console.log(`\n📨 Starting cron cycle at ${cronStart.toISOString()}`);

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('❌ Database error:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`👥 Found ${users?.length || 0} active users`);

    if (!users || users.length === 0) {
      return { success: true, message: 'No users to process' };
    }

    let totalTransactions = 0;
    let totalMissed = 0;

    for (const user of users) {
      const result = await processUser(user as User);
      if (result) {
        totalTransactions += result.transactions;
        totalMissed += result.missed;
      }
    }

    const duration = new Date().getTime() - cronStart.getTime();
    console.log(`🏁 Cycle completed - ${totalTransactions} transactions, ${totalMissed} missed, ${Math.floor(duration / 1000)}s\n`);

    return {
      success: true,
      totalTransactions,
      totalMissed,
      duration: Math.floor(duration / 1000),
    };

  } catch (error) {
    console.error('💥 Critical error:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Infinite loop mode
async function runInfiniteCron() {
  console.log('🚀 Starting cron service - running every 5 minutes\n');
  let cycleCount = 0;

  while (true) {
    cycleCount++;
    console.log(`\n🔄 === CYCLE ${cycleCount} ===`);

    try {
      await runCron();
      console.log(`⏳ Next cycle in 5 minutes...`);
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    } catch (error) {
      console.error(`❌ Cycle failed, retrying in 1 minute...`);
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runInfiniteCron().catch(console.error);
}
