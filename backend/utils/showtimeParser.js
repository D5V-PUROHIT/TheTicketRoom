// Parses human-readable cinema date & time strings (e.g. "Friday, 27 November, 2026" + "10:00 PM")
// into an IST (+05:30) timestamp string for the database starts_at column.

const MONTHS = {
  january: '01', jan: '01',
  february: '02', feb: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  may: '05',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08',
  september: '09', sep: '09', sept: '09',
  october: '10', oct: '10',
  november: '11', nov: '11',
  december: '12', dec: '12',
};

function parseDatePart(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Match ISO format YYYY-MM-DD directly if provided.
  const iso = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Match "Friday, 27 November, 2026" or "27 Nov 2026".
  const human = dateStr.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!human) return null;

  const day = human[1].padStart(2, '0');
  const month = MONTHS[human[2].toLowerCase()];
  const year = human[3];
  if (!month) return null;

  return `${year}-${month}-${day}`;
}

function parseTimePart(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : '';

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

/**
 * Returns an ISO-8601 timestamp string in IST (+05:30), or null if date/time could not be parsed.
 */
function parseShowTimestampIST(dateStr, timeStr) {
  const datePart = parseDatePart(dateStr);
  const timePart = parseTimePart(timeStr);
  if (!datePart || !timePart) return null;
  return `${datePart}T${timePart}+05:30`;
}

module.exports = { parseShowTimestampIST };
