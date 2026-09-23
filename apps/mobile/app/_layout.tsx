import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { UpdateBanner } from '../src/features/update/UpdateBanner';
import { useUpdateCheckOnForeground, useUpdateState } from '../src/lib/app-update';

export { ErrorBoundary } from 'expo-router';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  useUpdateCheckOnForeground();
  const updateState = useUpdateState();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // Pflicht-Update: Vollbild statt der ganzen Navigation, nicht nur ein Banner ohne
  // "Spaeter" — sonst liesse sich die App trotz Sperre weiter benutzen
  // (HEIMAPPS-SELBSTUPDATE.md, "Was Pflicht bewirken muss").
  if (updateState.kind !== 'none' && updateState.isMandatory) {
    return (
      <View style={styles.mandatory}>
        <UpdateBanner state={updateState} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0b0b0f' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'Neuer Trip' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip-Status' }} />
        <Stack.Screen name="join/[token]" options={{ title: 'Einladung' }} />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  mandatory: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0b0b0f',
  },
});
