import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (tripId: string) => `anchor:participant:${tripId}`;

export async function saveParticipant(tripId: string, participantId: string): Promise<void> {
  await AsyncStorage.setItem(key(tripId), participantId);
}

export async function getParticipant(tripId: string): Promise<string | null> {
  return AsyncStorage.getItem(key(tripId));
}
