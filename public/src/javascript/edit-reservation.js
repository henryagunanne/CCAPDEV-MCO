document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('#editReservationForm');
  if (!form) return;

  const cards = [...form.querySelectorAll('.passenger-card')];
  const tripType = form.dataset.returnId ? 'Round-Trip' : 'One-Way';
  const travelClass = form.dataset.travelClass;
  const seatValue = value => value && value !== 'null' && value !== 'undefined' ? value : '';
  const seatSelections = {
    outbound: cards.map(card => seatValue(card.dataset.seatOutbound)),
    returning: cards.map(card => seatValue(card.dataset.seatReturn))
  };
  const layouts = { outbound: null, returning: null };
  const message = document.querySelector('#formMessage');
  const say = text => { message.textContent = text; };

  /** * Load seat layout for a given flight leg and update the UI.
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   */
  async function loadLayout(leg) {
    const flightId = leg === 'outbound' ? form.dataset.outboundId : form.dataset.returnId;
    if (!flightId) return;
    const url = new URL(`/reservations/seats/${encodeURIComponent(flightId)}`, window.location.origin);
    url.searchParams.set('excludeReservation', form.dataset.reservationId);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load seat layout.');
    layouts[leg] = data;
  }


  /** * Render the seat map for a given flight leg based on the loaded layout and current selections.
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   */
  function drawMap(leg) {
    const container = document.querySelector(leg === 'outbound' ? '#seat-map-outbound' : '#seat-map-return');
    if (!container) return; // No container found for the specified leg
    container.replaceChildren();
    const layout = layouts[leg];

    // If layout is not loaded, display a message and return
    if (!layout) {
      container.textContent = 'Seat configuration is unavailable.';
      return;
    }

    // Draw the seat buttons based on the layout and current selections
    const occupied = new Set(layout.occupiedSeats);
    const selected = new Set(seatSelections[leg].filter(Boolean));

    // Create seat buttons for each seat in the layout
    for (const seat of layout.seats) {

      // Create a button element for the seat
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seat m-1 p-2 border rounded';
      button.textContent = seat.seatNumber;
      button.title = seat.travelClass;
      button.setAttribute('aria-label', `${seat.seatNumber}, ${seat.travelClass}`);

      if (occupied.has(seat.seatNumber)) {    // Seat is occupied
        button.disabled = true;
        button.classList.add('occupied', 'bg-secondary', 'text-white');
      } else if (seat.travelClass !== travelClass) {  // Seat is not in the selected travel class
        button.disabled = true;
        button.classList.add('text-muted');
      } else if (selected.has(seat.seatNumber)) { // Seat is currently selected
        button.classList.add('selected', 'bg-warning');
      } else {        // Seat is available for selection
        button.classList.add('available');
      }

      // Add click event listener to handle seat selection
      button.addEventListener('click', () => chooseSeat(leg, seat.seatNumber));
      container.append(button);
    }
  }

  /** * Handle seat selection for a given flight leg, updating the UI and summary accordingly.
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   * @param {string} seatNumber - The seat number being selected or deselected.
   */
  function chooseSeat(leg, seatNumber) {
    const selected = seatSelections[leg];
    const currentIndex = selected.indexOf(seatNumber);
    if (currentIndex !== -1) selected[currentIndex] = '';
    else {
      const next = selected.findIndex(seat => !seat);
      if (next === -1) return say('Each passenger already has a seat for this flight.');
      selected[next] = seatNumber;
    }
    const labelClass = leg === 'outbound' ? '.seat-label-outbound' : '.seat-label-returning';
    cards.forEach((card, index) => {
      const label = card.querySelector(labelClass);
      if (label) label.textContent = selected[index] || 'Not selected';
    });
    drawMap(leg);
    updateSummary();
  }

  /** * Update the reservation summary, including fares, meal fees, baggage fees, and total price.
   */
  function updateSummary() {
    const meals = cards.filter(card => card.querySelector('.meal-option').value !== 'None').length * 150;
    const baggage = cards.reduce((sum, card) =>
      sum + (Number(card.querySelector('.baggage-input').value) || 0) * 50, 0);
    const seatTariff = {
      First: 5000,
      Business: 3000,
      'Premium Economy': 1700,
      Economy: 1500
    }[travelClass] || 0;
    const seatCount = seatSelections.outbound.filter(Boolean).length +
      (tripType === 'Round-Trip' ? seatSelections.returning.filter(Boolean).length : 0);
    const fare = Number(document.querySelector('#baseFare').dataset.fare || 0) +
      Number(document.querySelector('#returnFare')?.dataset.fare || 0);
    document.querySelector('#mealFee').textContent = String(meals);
    document.querySelector('#baggageFee').textContent = String(baggage);
    document.querySelector('#seatFee').textContent = String(seatCount * seatTariff);
    document.querySelector('#totalPrice').textContent =
      String(fare * cards.length + meals + baggage + seatCount * seatTariff);
  }

  // Add event listeners to meal and baggage inputs for each passenger card to update the summary when changed
  cards.forEach(card => {
    card.querySelector('.meal-option').addEventListener('change', updateSummary);
    card.querySelector('.baggage-input').addEventListener('input', updateSummary);
  });

  // Load seat layouts and draw maps for both flight legs, then update the summary
  try {
    await loadLayout('outbound');
    if (tripType === 'Round-Trip') await loadLayout('returning');
    drawMap('outbound');
    if (tripType === 'Round-Trip') drawMap('returning');
    updateSummary();
  } catch (error) {
    say(error.message);
    form.querySelector('[type="submit"]').disabled = true;
  }

  // Handle form submission for editing the reservation
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (seatSelections.outbound.some(seat => !seat) ||
        (tripType === 'Round-Trip' && seatSelections.returning.some(seat => !seat))) {
      say('Select one seat per passenger for every flight leg.');
      return;
    }
    const passengers = cards.map((card, index) => ({
      fullName: card.dataset.fullName,
      age: Number(card.dataset.age),
      gender: card.dataset.gender,
      passport: card.dataset.passport,
      meal: card.querySelector('.meal-option').value,
      baggageAllowance: Number(card.querySelector('.baggage-input').value),
      seatNumber: seatSelections.outbound[index],
      ...(tripType === 'Round-Trip' ? { returnSeatNumber: seatSelections.returning[index] } : {})
    }));
    document.querySelector('#passengersJSON').value = JSON.stringify(passengers);
    document.querySelector('#totalPriceInput').value = document.querySelector('#totalPrice').textContent;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passengersJSON: document.querySelector('#passengersJSON').value,
          totalPrice: document.querySelector('#totalPriceInput').value
        })
      });
      if (!response.ok) {
        say(await response.text());
        return;
      }
      document.open();
      document.write(await response.text());
      document.close();
    } catch {
      say('Unable to save reservation changes.');
    } finally {
      button.disabled = false;
    }
  });
});
