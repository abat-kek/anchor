import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test('guest joins, commits, and trip auto-locks after deadline', async ({ page, request }) => {
  // Arrange: Trip mit Deadline in der Vergangenheit + Terminfenster.
  const { data: group } = await admin.from('groups').insert({ name: 'E2E-Crew' }).select('id').single();
  const past = new Date(Date.now() - 60_000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Trip', deadline: past })
    .select('id, share_token').single();
  const { data: opts } = await admin.from('trip_date_options').insert([
    { trip_id: trip!.id, start_date: '2026-03-14', end_date: '2026-03-16' },
    { trip_id: trip!.id, start_date: '2026-03-21', end_date: '2026-03-23' },
  ]).select('id, start_date');

  // Act 1: Gast tritt bei.
  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Testgast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  // Act 2: Verfügbarkeit für erstes Fenster + Zusage.
  await page.getByRole('button', { name: '✅ Ja' }).first().click();
  await page.getByRole('button', { name: /Ich bin dabei/ }).click();
  await expect(page.getByText('1/1 dabei')).toBeVisible();

  // Act 3: Auto-Lock-Function anstoßen (Deadline liegt in der Vergangenheit).
  const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auto-lock`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  expect(res.ok()).toBeTruthy();

  // Assert: Trip ist gelockt auf das gewählte Fenster.
  const { data: locked } = await admin
    .from('trips').select('status, locked_date_option_id').eq('id', trip!.id).single();
  expect(locked!.status).toBe('locked');
  const firstOption = opts!.find((o) => o.start_date === '2026-03-14');
  expect(locked!.locked_date_option_id).toBe(firstOption!.id);

  // UI reflektiert den Lock (Realtime).
  await expect(page.getByText('🎉 Termin steht fest!')).toBeVisible();
});
