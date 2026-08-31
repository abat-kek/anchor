import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'anchor:participant:';
const key = (tripId: string) => `${PREFIX}${tripId}`;

export async function saveParticipant(tripId: string, participantId: string): Promise<void> {
  await AsyncStorage.setItem(key(tripId), participantId);
}

export async function getParticipant(tripId: string): Promise<string | null> {
  return AsyncStorage.getItem(key(tripId));
}

export async function listTripIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
}
