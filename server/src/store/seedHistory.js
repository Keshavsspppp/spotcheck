// Generates realistic-looking fake CheckEvents for the last 7 days,
// weighted toward each category's typical busy hours and each category's
// typical weekday/weekend split (e.g. a canteen goes quiet on weekends,
// a gym gets busier).
const BUSY_HOURS = {
  Canteen: { peak: [12, 13, 19, 20], base: 0.15, weekendFactor: 0.5 },
  Library: { peak: [10, 11, 12, 13, 14, 15, 16, 17], base: 0.2, weekendFactor: 0.6 },
  Gym: { peak: [6, 7, 8, 17, 18, 19], base: 0.1, weekendFactor: 1.1 },
  Parking: { peak: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], base: 0.15, weekendFactor: 0.4 },
  "Study Room": { peak: [14, 15, 16, 17, 18, 19, 20, 21], base: 0.15, weekendFactor: 1.2 },
};

function profileFor(category) {
  return BUSY_HOURS[category] || BUSY_HOURS.Parking;
}

function weightForHour(category, hour) {
  const profile = profileFor(category);
  return profile.peak.includes(hour) ? 1 : profile.base;
}

function isWeekendUTC(date) {
  const day = date.getUTCDay(); // 0=Sun ... 6=Sat
  return day === 0 || day === 6;
}

function generateHistoryEvents(location) {
  const events = [];
  const now = Date.now();
  const maxPerHour = Math.max(2, Math.round(location.capacity * 0.25));
  const profile = profileFor(location.category);

  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const dayDate = new Date(now);
    dayDate.setUTCDate(dayDate.getUTCDate() - daysAgo);
    const weekendMultiplier = isWeekendUTC(dayDate) ? profile.weekendFactor : 1;

    for (let hour = 0; hour < 24; hour++) {
      const weight = weightForHour(location.category, hour) * weekendMultiplier;
      const count = Math.round(weight * maxPerHour * (0.6 + Math.random() * 0.6));
      for (let i = 0; i < count; i++) {
        const minute = Math.floor(Math.random() * 60);
        const timestamp = new Date(now);
        timestamp.setUTCDate(timestamp.getUTCDate() - daysAgo);
        timestamp.setUTCHours(hour, minute, 0, 0);
        events.push({
          sessionId: `seed-${location._id || location.id}-${daysAgo}-${hour}-${i}`,
          action: "in",
          timestamp,
        });
      }
    }
  }
  return events;
}

module.exports = { generateHistoryEvents };
