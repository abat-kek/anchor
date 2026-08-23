'use client';

const key = (tripId: string) => `anchor:participant:${tripId}`;

export function saveParticipant(tripId: string, participantId: string): void {
  localStorage.setItem(key(tripId), participantId);
}

export function getParticipant(tripId: string): string | null {
  return localStorage.getItem(key(tripId));
}
