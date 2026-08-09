// Generates realistic-looking fake CheckEvents for the last 7 days,
// weighted toward each category's typical busy hours.
const BUSY_HOURS = {
  Canteen: { peak: [12, 13, 19, 20], base: 0.15 },
  Library: { peak: [10, 11, 12, 13, 14, 15, 16, 17], base: 0.2 },
  Gym: { peak: [6, 7, 8, 17, 18, 19], base: 0.1 },
  Parking: { peak: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], base: 0.15 },
  "Study Room": { peak: [14, 15, 16, 17, 18, 19, 20, 21], base: 0.15 },
};

function weightForHour(category, hour) {
  const profile = BUSY_HOURS[category] || BUSY_HOURS.Parking;
  return profile.peak.includes(hour) ? 1 : profile.base;
}

function generateHistoryEvents(location) {
  const events = [];
  const now = Date.now();
  const maxPerHour = Math.max(2, Math.round(location.capacity * 0.25));

  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    for (let hour = 0; hour < 24; hour++) {
      const weight = weightForHour(location.category, hour);
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
