const { ensureAircraftLayout } = require('../../services/seatAllocationService');

module.exports = async function seedAircraftLayouts() {
  const definitions = [
    { aircraft: 'Airbus A320', capacity: 154 },
    { aircraft: 'Boeing 737', capacity: 195 }
  ];
  const layouts = [];
  for (const item of definitions) layouts.push(await ensureAircraftLayout(item.aircraft, item.capacity));
  console.log(`Aircraft layouts: ${layouts.length} verified/upserted.`);
  return layouts;
};
