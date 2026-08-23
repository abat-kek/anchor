import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveLock } from '@anchor/domain/lock.ts';
import { computeTallies, countCommitted } from '@anchor/domain/commitment.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, deadline')
    .eq('status', 'collecting')
    .lte('deadline', nowIso);
  if (error) return new Response(error.message, { status: 500 });

  let locked = 0;
  for (const trip of trips ?? []) {
    const [{ data: options }, { data: participants }, { data: avail }] = await Promise.all([
      supabase.from('trip_date_options').select('id, trip_id, start_date, end_date')
        .eq('trip_id', trip.id).order('start_date', { ascending: true }),
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', trip.id),
      supabase.from('date_availabilities').select('date_option_id, participant_id, availability')
        .eq('trip_id', trip.id),
    ]);

    const committedIds = (participants ?? []).filter((p) => p.is_committed).map((p) => p.id);
    const mappedOptions = (options ?? []).map((o) => ({
      id: o.id, tripId: o.trip_id, startDate: o.start_date, endDate: o.end_date,
    }));
    const mappedAvail = (avail ?? []).map((a) => ({
      dateOptionId: a.date_option_id, participantId: a.participant_id, availability: a.availability,
    }));

    const tallies = computeTallies(mappedOptions, mappedAvail, committedIds);
    const decision = resolveLock({
      now: nowIso,
      deadline: trip.deadline,
      options: mappedOptions,
      tallies,
      totalCommitted: countCommitted(participants ?? []),
    });

    if (decision.action === 'lock') {
      await supabase.from('trips')
        .update({ status: 'locked', locked_date_option_id: decision.optionId })
        .eq('id', trip.id);
      locked++;
    }
  }

  return new Response(JSON.stringify({ checked: trips?.length ?? 0, locked }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
