import { useState } from 'react';
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
          minimumDate={minimumDate}
          onValueChange={(_event, selectedDate) => {
            // Android blendet den Dialog selbst aus, die Komponente muss danach
            // aber abgeraeumt werden, sonst oeffnet sie sich beim naechsten
            // Render erneut.
            setIsPickerOpen(false);
            onChange(toIsoDate(selectedDate));
          }}
          onDismiss={() => setIsPickerOpen(false)}
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
