export type SqlValue = string | number | boolean | null | readonly string[];

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function sqlLiteral(value: SqlValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in seed: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return quote(value);
  return `array[${value.map(quote).join(', ')}]::text[]`;
}
