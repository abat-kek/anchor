import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test('guest proposes two stays, approval-votes, retracts a vote, and crowns the winner', async ({
  page,
}) => {
  // Arrange: Gruppe + Trip direkt auf 'locked' — die Terminabstimmung ist fuer diesen
  // Test nicht das Ziel, nur die Voraussetzung dafuer, dass die Unterkunftsphase startet.
  const { data: group } = await admin
    .from('groups').insert({ name: 'E2E-Accommodation-Crew' }).select('id').single();
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Accommodation Trip', deadline: future })
    .select('id, share_token').single();
  await admin.from('trips').update({ status: 'locked' }).eq('id', trip!.id);

  // Act 1: Gast tritt ueber den Join-Link bei.
  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Unterkunfts-Gast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  await expect(page.getByRole('heading', { name: 'Wo schlafen wir?' })).toBeVisible();

  const titleA = 'Gemuetliches Loft';
  const titleB = 'Strandhaus Nordsee';

  // Der <p>-Titel der Karte traegt bei Stimmengleichstand/Gewinnerstatus ein "⭐ "-Praefix
  // (isWinner in accommodation-section.tsx), das Muster laesst es optional zu. Sobald das
  // Kuer-Auswahlfeld erscheint, taucht derselbe Titel auch als <option>-Text auf — aber dort
  // immer mit " (Stimmenzahl)" angehaengt, das Anker-$ am Ende schliesst das sicher aus.
  function stayCard(title: string) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^(?:⭐ )?${escaped}$`);
    return page.getByText(pattern).locator('xpath=..');
  }

  async function proposeStay(url: string, title: string) {
    await page.getByLabel('Link zur Unterkunft').fill(url);
    await page.getByLabel('Name der Unterkunft').fill(title);
    await page.getByRole('button', { name: 'Vorschlagen' }).click();
    await expect(stayCard(title)).toBeVisible();
  }

  // Act 2: zwei Unterkuenfte vorschlagen. A zuerst, damit sie bei Stimmengleichstand
  // (Tiebreak nach created_at in resolveAccommodationWinner) als Gewinner vorbelegt ist.
  await proposeStay('https://example.com/loft', titleA);
  await proposeStay('https://example.com/strandhaus', titleB);

  // Act 3: beide billigen.
  await stayCard(titleA).getByRole('button', { name: /Dafür/ }).click();
  await expect(stayCard(titleA).getByRole('button', { name: /Dafür/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await stayCard(titleB).getByRole('button', { name: /Dafür/ }).click();
  await expect(stayCard(titleB).getByRole('button', { name: /Dafür/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Assert: Stimmenzahl pruefen, sowohl in der Oberflaeche als auch in der Datenbank.
  await expect(stayCard(titleA).getByRole('button', { name: /Dafür/ })).toHaveText(/· 1$/);
  await expect(stayCard(titleB).getByRole('button', { name: /Dafür/ })).toHaveText(/· 1$/);

  const { data: optionsAfterVotes } = await admin
    .from('accommodation_options').select('id, title').eq('trip_id', trip!.id);
  const optionA = optionsAfterVotes!.find((o) => o.title === titleA)!;
  const optionB = optionsAfterVotes!.find((o) => o.title === titleB)!;

  const { count: votesForAAfter } = await admin
    .from('accommodation_votes').select('id', { count: 'exact', head: true }).eq('option_id', optionA.id);
  const { count: votesForBAfter } = await admin
    .from('accommodation_votes').select('id', { count: 'exact', head: true }).eq('option_id', optionB.id);
  expect(votesForAAfter).toBe(1);
  expect(votesForBAfter).toBe(1);

  // Act 4: eine Stimme zuruecknehmen (Toggle auf A) — B bleibt als einzige Option mit
  // Stimmen uebrig und wird dadurch zum alleinigen Gewinner.
  await stayCard(titleA).getByRole('button', { name: /Dafür/ }).click();
  await expect(stayCard(titleA).getByRole('button', { name: /Dafür/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(stayCard(titleA).getByRole('button', { name: /Dafür/ })).toHaveText(/· 0$/);

  const { count: votesForAAfterRetract } = await admin
    .from('accommodation_votes').select('id', { count: 'exact', head: true }).eq('option_id', optionA.id);
  expect(votesForAAfterRetract).toBe(0);

  // Act 5: kueren — erst der Ausloeser, dann die Rueckfrage mit role="alertdialog",
  // erst deren Bestaetigung ruft choose_accommodation auf.
  await page.getByRole('button', { name: 'Diese Unterkunft nehmen wir' }).click();
  const confirmDialog = page.getByRole('alertdialog');
  await expect(confirmDialog).toBeVisible();
  const confirmButton = confirmDialog.getByRole('button', { name: `Ja, ${titleB} nehmen wir` });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // Assert: Gewinner steht in der Datenbank, nicht nur in der Oberflaeche.
  await expect(page.getByText(`🏠 ${titleB}`)).toBeVisible();
  const { data: chosenTrip } = await admin
    .from('trips').select('status, chosen_accommodation_id').eq('id', trip!.id).single();
  expect(chosenTrip!.status).toBe('active');
  expect(chosenTrip!.chosen_accommodation_id).toBe(optionB.id);
});
