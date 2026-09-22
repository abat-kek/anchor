import { test, expect } from '@playwright/test';
import { admin, cleanupTrackedRows, trackGroup, trackTrip } from './support/test-supabase';

test.afterEach(cleanupTrackedRows);

test('guest proposes own date option and sees the participant list', async ({ page }) => {
  const { data: group } = await admin.from('groups').insert({ name: 'E2E-Proposal-Crew' }).select('id').single();
  trackGroup(group!.id);
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Proposal Trip', deadline: future })
    .select('id, share_token').single();
  trackTrip(trip!.id);

  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Vorschlag-Gast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  await expect(page.getByText('⏳ Vorschlag-Gast')).toBeVisible();

  // Datumswerte relativ zu heute, nicht fest verdrahtet: validateDateOptionInput lehnt
  // ein Startdatum in der Vergangenheit ab, ein fixes Datum liesse den Test irgendwann
  // ohne Codeaenderung umkippen.
  const isoDay = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const proposedStart = isoDay(30);
  const proposedEnd = isoDay(32);

  await page.getByLabel('Startdatum').fill(proposedStart);
  await page.getByLabel('Enddatum').fill(proposedEnd);
  await page.getByRole('button', { name: 'Vorschlagen' }).click();

  await expect(page.getByText(`${proposedStart} – ${proposedEnd}`)).toBeVisible();

  const { data: options } = await admin
    .from('trip_date_options').select('start_date, end_date').eq('trip_id', trip!.id);
  expect(options).toContainEqual({ start_date: proposedStart, end_date: proposedEnd });
});
