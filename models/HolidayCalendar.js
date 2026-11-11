const mongoose = require('mongoose');

const holidayCalendarSchema = new mongoose.Schema({
  year: { type: Number, required: true, min: 2020, max: 2200 },
  version: { type: String, required: true },
  operatingLocation: { type: String, required: true },
  sourceReference: { type: String, required: true },
  timeZone: { type: String, required: true, enum: ['Asia/Manila'], default: 'Asia/Manila' },
  publishedAt: { type: Date, required: true },
  holidays: [{
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['regular', 'special-non-working', 'local', 'office-closure'],
      required: true
    }
  }]
}, { timestamps: true });

holidayCalendarSchema.index({ year: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('HolidayCalendar', holidayCalendarSchema);
