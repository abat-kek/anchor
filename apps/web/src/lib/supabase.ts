import { createClient } from '@supabase/supabase-js';
import type { Database } from '@anchor/shared/db-types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Note: DB type may need `as any` workaround for supabase-js SDK until proper generation
export const supabase = createClient<Database>(url, anonKey) as any;
