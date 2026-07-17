export function shortDayLabel(value) {
  const day = String(value ?? "").trim();
  if (!day) return "";

  const frenchDate = day.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-]\d{2,4})?$/);
  if (frenchDate) {
    const dayNumber = Number(frenchDate[1]);
    const monthNumber = Number(frenchDate[2]);
    if (dayNumber >= 1 && dayNumber <= 31 && monthNumber >= 1 && monthNumber <= 12) {
      return `${String(dayNumber).padStart(2, "0")}/${String(monthNumber).padStart(2, "0")}`;
    }
  }

  const isoDate = day.match(/^\d{4}-(\d{2})-(\d{2})(?:$|T)/);
  if (isoDate) return `${isoDate[2]}/${isoDate[1]}`;

  return day;
}
