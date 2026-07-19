function validDateParts(day, month) {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function compactDateRange(startDay, startMonth, endDay, endMonth) {
  if (![startDay, startMonth, endDay, endMonth].every(Number.isFinite)) return null;
  if (!validDateParts(startDay, startMonth) || !validDateParts(endDay, endMonth)) return null;
  const start = String(startDay).padStart(2, "0");
  const end = String(endDay).padStart(2, "0");
  const endMonthLabel = String(endMonth).padStart(2, "0");
  if (startMonth === endMonth) return `${start}-${end}/${endMonthLabel}`;
  return `${start}/${String(startMonth).padStart(2, "0")}-${end}/${endMonthLabel}`;
}

export function shortDayLabel(value) {
  const day = String(value ?? "").trim();
  if (!day) return "";

  const alreadyCompactRange = day.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/);
  if (alreadyCompactRange) {
    const compact = compactDateRange(Number(alreadyCompactRange[1]), Number(alreadyCompactRange[3]), Number(alreadyCompactRange[2]), Number(alreadyCompactRange[3]));
    if (compact) return compact;
  }

  const frenchRange = day.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?\s*(?:au|à|et|jusqu['’]au|[-–—→])\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/i);
  if (frenchRange) {
    const compact = compactDateRange(Number(frenchRange[1]), Number(frenchRange[2]), Number(frenchRange[3]), Number(frenchRange[4]));
    if (compact) return compact;
  }

  const isoRange = day.match(/^\d{4}-(\d{2})-(\d{2})(?:T[^\s]+)?\s*(?:au|à|et|[-–—→])\s*\d{4}-(\d{2})-(\d{2})(?:T[^\s]+)?$/i);
  if (isoRange) {
    const compact = compactDateRange(Number(isoRange[2]), Number(isoRange[1]), Number(isoRange[4]), Number(isoRange[3]));
    if (compact) return compact;
  }

  const frenchDate = day.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/);
  if (frenchDate) {
    const dayNumber = Number(frenchDate[1]);
    const monthNumber = Number(frenchDate[2]);
    if (validDateParts(dayNumber, monthNumber)) {
      return `${String(dayNumber).padStart(2, "0")}/${String(monthNumber).padStart(2, "0")}`;
    }
  }

  const isoDate = day.match(/^\d{4}-(\d{2})-(\d{2})(?:$|T)/);
  if (isoDate) return `${isoDate[2]}/${isoDate[1]}`;

  return day;
}
