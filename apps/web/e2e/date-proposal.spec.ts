import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test('guest proposes own date option and sees the participant list', async ({ page }) => {
  const { data: group } = await admin.from('groups').insert({ name: 'E2E-Proposal-Crew' }).select('id').single();
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Proposal Trip', deadline: future })
    .select('id, share_token').single();

  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Vorschlag-Gast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  await expect(page.getByText('⏳ Vorschlag-Gast')).toBeVisible();

  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-05-01');
  await dateInputs.nth(1).fill('2026-05-03');
  await page.getByRole('button', { name: 'Vorschlagen' }).click();

  await expect(page.getByText('2026-05-01 – 2026-05-03')).toBeVisible();

  const { data: options } = await admin
    .from('trip_date_options').select('start_date, end_date').eq('trip_id', trip!.id);
  expect(options).toContainEqual({ start_date: '2026-05-01', end_date: '2026-05-03' });
});
