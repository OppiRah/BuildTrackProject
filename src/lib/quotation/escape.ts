// HTML escaping for server-rendered pages (public and owner Workers). Every interpolated
// value in Worker HTML goes through `escapeHtml`; nothing else builds markup from data.

const replacements: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => replacements[char]!);
}
