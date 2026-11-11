const TIME_ZONE = 'Asia/Manila';


/** * Get the date parts (year, month, day) in Manila time for a given timestamp.
 * @param {number} timestamp - The timestamp to convert.
 * @returns {Object} - An object containing year, month, and day as strings.
 */
function manilaDateParts(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(timestamp);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}


/** * Generate a date key in the format YYYY-MM-DD for a given date.
 * @param {Date} date - The date object to format.
 * @returns {string} - The formatted date key.
 */
function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}


/** * Get the end of the day in Manila time for a given date.
 * @param {Date} date - The date object to calculate the end of day for.
 * @returns {Date} - A new Date object representing the end of the day in Manila time.
 */
function manilaEndOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 15, 59, 59, 999));
}


/** * Calculate the deadline based on working days, considering weekends and holidays.
 * @param {Date} receivedAt - The date when the request was received.
 * @param {number} days - The number of working days to count.
 * @param {Map<number, Object>} calendarsByYear - A map of year to holiday calendar objects.
 * @returns {Object} - An object containing the calculated deadline and the versions of the calendars used.
 * @throws {TypeError} - If the input parameters are invalid.
 * @throws {Error} - If a holiday calendar is missing for a year.
 */
function calculateWorkingDayDeadline(receivedAt, days, calendarsByYear) {
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime()) || !Number.isInteger(days) || days < 1) {
    throw new TypeError('A valid receipt timestamp and positive working-day count are required.');
  }
  const local = manilaDateParts(received);
  const cursor = new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day)));
  let counted = 0;
  const versions = new Set();
  while (counted < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const key = dateKey(cursor);
    const calendar = calendarsByYear.get(cursor.getUTCFullYear());
    if (!calendar || !calendar.version || !Array.isArray(calendar.holidays)) {
      throw new Error(`An approved holiday calendar is missing for ${cursor.getUTCFullYear()}.`);
    }
    versions.add(calendar.version);
    const weekday = cursor.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const isHoliday = calendar.holidays.some(holiday => holiday.date === key);
    if (!isWeekend && !isHoliday) counted += 1;
  }
  return { deadline: manilaEndOfDay(cursor), calendarVersions: [...versions].sort() };
}


/** * Calculate the privacy deadlines for acknowledgement and completion based on the received date.
 * @param {Date} receivedAt - The date when the request was received.
 * @param {Map<number, Object>} calendarsByYear - A map of year to holiday calendar objects.
 * @returns {Object} - An object containing the acknowledgement and completion deadlines and their respective calendar versions.
 */
function calculatePrivacyDeadlines(receivedAt, calendarsByYear) {
  const acknowledgement = calculateWorkingDayDeadline(receivedAt, 5, calendarsByYear);
  const completion = calculateWorkingDayDeadline(receivedAt, 30, calendarsByYear);
  return {
    acknowledgementDueAt: acknowledgement.deadline,
    completionDueAt: completion.deadline,
    acknowledgementCalendarVersions: acknowledgement.calendarVersions,
    completionCalendarVersions: completion.calendarVersions
  };
}

module.exports = {
  TIME_ZONE,
  calculateWorkingDayDeadline,
  calculatePrivacyDeadlines
};
