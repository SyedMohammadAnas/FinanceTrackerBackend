/**
 * Script to reset user authentication status
 * This marks users as inactive so they need to re-authenticate
 * Run with: npx tsx scripts/reset-user-auth.ts <email>
 * Or reset all: npx tsx scripts/reset-user-auth.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function resetUserAuth(email?: string) {
  console.log('🔄 Resetting user authentication...\n');

  if (email) {
    // Reset specific user
    const { data, error } = await supabase
      .from('users')
      .update({
        is_active: false,
        google_access_token: '',
        google_refresh_token: '',
      })
      .eq('google_email', email)
      .select();

    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log(`✅ Reset authentication for: ${email}`);
      console.log('   User needs to re-authenticate on the frontend.');
    } else {
      console.log(`❌ User not found: ${email}`);
    }
  } else {
    // Reset all users
    const { data, error } = await supabase
      .from('users')
      .update({
        is_active: false,
        google_access_token: '',
        google_refresh_token: '',
      })
      .eq('is_active', true)
      .select();

    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    console.log(`✅ Reset authentication for ${data?.length || 0} user(s)`);
    console.log('   All users need to re-authenticate on the frontend.');
  }
}

const email = process.argv[2];
resetUserAuth(email).catch(console.error);
