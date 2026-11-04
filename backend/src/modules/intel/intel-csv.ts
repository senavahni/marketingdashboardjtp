export function csvCell(value: unknown): string {
  let text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
