/** Platform-agnostic contract for the transaction date field. */
export interface DatePickerFieldProps {
  /** `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
}

/** Parsed as local midnight, so no time-zone day shift either way. */
export function parseOccurredOn(occurredOn: string): Date {
  return new Date(`${occurredOn}T00:00:00`);
}

export function toOccurredOn(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** "11 September 2026" — readable, not the raw ISO string. */
export function formatOccurredOn(occurredOn: string): string {
  return parseOccurredOn(occurredOn).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
