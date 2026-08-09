const mongoose = require("mongoose");

const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  capacity: { type: Number, required: true },
  currentCount: { type: Number, default: 0 },
  category: { type: String, required: true },
  confidenceScore: { type: Number, default: 100 },
  lastEventAt: { type: Date, default: Date.now },
});

const CheckEventSchema = new mongoose.Schema({
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
  sessionId: { type: String, required: true },
  action: { type: String, enum: ["in", "out", "correction"], required: true },
  timestamp: { type: Date, default: Date.now },
});
CheckEventSchema.index({ locationId: 1, timestamp: -1 });

const HeartbeatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
  lastPing: { type: Date, default: Date.now },
});
HeartbeatSchema.index({ sessionId: 1, locationId: 1 }, { unique: true });

const Location = mongoose.model("Location", LocationSchema);
const CheckEvent = mongoose.model("CheckEvent", CheckEventSchema);
const Heartbeat = mongoose.model("Heartbeat", HeartbeatSchema);

module.exports = { Location, CheckEvent, Heartbeat };
