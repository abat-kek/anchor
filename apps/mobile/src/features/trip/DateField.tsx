import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatIsoDateGerman, parseIsoDate, toIsoDate } from '@anchor/shared';

interface DateFieldProps {
  /** Beschriftung fuer Screenreader, z. B. "Startdatum". */
  label: string;
  /** Der gewaehlte Tag als ISO-`YYYY-MM-TT`, oder '' solange nichts gewaehlt ist. */
  value: string;
  placeholder: string;
  /** Frueheste waehlbare Kalenderseite; alles davor ist im Dialog ausgegraut. */
  minimumDate: Date;
  isDisabled?: boolean;
  onChange: (isoDate: string) => void;
}

/**
 * Ein Datumsfeld ohne Tastatur: Tippen oeffnet den nativen Kalenderdialog.
 * Nach aussen spricht das Feld ausschliesslich ISO-`YYYY-MM-TT` — die lesbare
 * Form `14.03.2026` entsteht nur fuer die Anzeige.
 */
export function DateField({
  label,
  value,
  placeholder,
  minimumDate,
  isDisabled = false,
  onChange,
}: DateFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Die Android-Fassung des Pickers oeffnet den Dialog neu, sobald sich
  // `onValueChange` oder `onDismiss` aendern (Effekt-Abhaengigkeiten in
  // datetimepicker.android.js). Inline-Funktionen waeren bei jedem Render neu —
  // der 4-Sekunden-Poll der Trip-Seite warf den Dialog so auf den Startwert
  // zurueck, waehrend man darin blaetterte. Deshalb stabile Callbacks, und das
  // `onChange` des Aufrufers laeuft ueber einen Ref statt ueber die Abhaengigkeiten.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleValueChange = useCallback((_event: unknown, selectedDate: Date) => {
    // Android blendet den Dialog selbst aus, die Komponente muss danach
    // aber abgeraeumt werden, sonst oeffnet sie sich beim naechsten
    // Render erneut.
    setIsPickerOpen(false);
    onChangeRef.current(toIsoDate(selectedDate));
  }, []);

  const handleDismiss = useCallback(() => setIsPickerOpen(false), []);

  const displayValue = formatIsoDateGerman(value);
  // Ohne eigene Wahl startet der Dialog auf der Untergrenze — nie auf einem
  // Tag, den der Nutzer ohnehin nicht nehmen darf.
  const pickerValue = parseIsoDate(value) ?? minimumDate;

  return (
    <>
      <Pressable
        onPress={() => setIsPickerOpen(true)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: displayValue ?? placeholder }}
        accessibilityState={{ disabled: isDisabled }}
        style={[styles.field, isDisabled && styles.fieldDisabled]}
      >
        <Text style={displayValue ? styles.value : styles.placeholder}>
          {displayValue ?? placeholder}
        </Text>
      </Pressable>
      {isPickerOpen && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          // Material-3-Dialog statt des Framework-Dialogs: auf einem Galaxy S23
          // (One UI) sprang der Framework-Dialog nach etwa 2 s auf den Startwert
          // zurueck, auch mit stabilen Callbacks. Braucht ein Material-3-App-Theme,
          // das plugins/with-material-theme.js setzt.
          design="material"
          minimumDate={minimumDate}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 10,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: '#17171d',
  },
  fieldDisabled: { opacity: 0.4 },
  value: { color: '#fff', fontSize: 14 },
  placeholder: { color: '#8a8a94', fontSize: 14 },
});
