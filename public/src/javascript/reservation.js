document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#reservationForm');
  if (!form) return;

  const tripType = document.querySelector('#tripTypeSelect');
  const travelClass = document.querySelector('#travelClassSelect');
  const passengerCount = document.querySelector('#passengerCount');
  const passengerFields = document.querySelector('#passengerFields');
  const outboundSelect = document.querySelector('#outboundFlight');
  const fixedOutbound = document.querySelector('input[name="flight"]');
  const returnSelect = document.querySelector('#returnFlight');
  const returnSection = document.querySelector('#returnFlightSection');
  const returnMapSection = document.querySelector('#returnSeatSection');
  const formMessage = document.querySelector('#formMessage');
  const formError = message => {
    if (formMessage) formMessage.textContent = message;
    else window.alert(message);
  };
  const layouts = { outbound: null, returning: null };
  const selections = { outbound: [], returning: [] };
  let passengerData = [];

  const selectedFlightId = leg => leg === 'outbound'
    ? (fixedOutbound?.value || outboundSelect?.value || '')
    : (returnSelect?.value || '');

  const selectedFare = leg => {
    if (leg === 'outbound' && fixedOutbound) {
      return Number(document.querySelector('#baseFare')?.dataset.fare || 0);
    }
    const select = leg === 'outbound' ? outboundSelect : returnSelect;
    return Number(select?.selectedOptions[0]?.dataset.price || 0);
  };

  
  /** * Render the passenger input fields based on the selected passenger count.
   */
  function renderPassengers() {
    const count = Number(passengerCount?.value || 1);
    passengerData = Array.from({ length: count }, () => ({
      fullName: '',
      age: '',
      gender: '',
      passport: '',
      meal: 'None',
      baggageAllowance: 0
    }));
    selections.outbound = Array(count).fill('');
    selections.returning = Array(count).fill('');
    passengerFields.replaceChildren();

    passengerData.forEach((passenger, index) => {
      const card = document.createElement('section');
      card.className = 'card my-3 shadow-sm';
      card.innerHTML = `
        <div class="card-header bg-light"><strong>Passenger ${index + 1}</strong></div>
        <div class="card-body">
          <div class="row mb-2">
            <label class="col-md-6">Full name
              <input class="form-control passenger-name" required minlength="2" maxlength="100">
            </label>
            <label class="col-md-6">Gender
              <select class="form-select passenger-gender" required>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </label>
          </div>
          <div class="row mb-2">
            <label class="col-md-6">Age
              <input class="form-control passenger-age" type="number" min="0" max="120" step="1" required>
            </label>
            <label class="col-md-6">Passport number
              <input class="form-control passenger-passport" required minlength="6" maxlength="9" pattern="[A-Za-z0-9]{6,9}">
            </label>
          </div>
          <div class="row">
            <label class="col-md-6">Meal
              <select class="form-select passenger-meal">
                <option>None</option><option>Vegetarian</option><option>Non-Vegetarian</option><option>Vegan</option><option>Gluten-Free</option>
              </select>
            </label>
            <label class="col-md-6">Baggage (kg)
              <input class="form-control passenger-baggage" type="number" min="0" max="40" step="1" value="0" required>
            </label>
          </div>
          <div class="small text-muted mt-2">Outbound seat: <span class="seat-label-outbound">Not selected</span></div>
          <div class="small text-muted return-seat-label d-none">Return seat: <span class="seat-label-returning">Not selected</span></div>
        </div>`;
      passengerFields.append(card);
    });

    renderSeatMap('outbound');
    renderSeatMap('returning');
    updateSummary();
  }

  /** * Render the seat map for a given flight leg (outbound or returning).
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   */
  function renderSeatMap(leg) {
    const container = document.querySelector(
      leg === 'outbound' ? '#seat-map-outbound' : '#seat-map-return'
    );
    if (!container) return;
    container.replaceChildren();
    const layout = layouts[leg];
    if (!selectedFlightId(leg) || !layout) {
      container.textContent = selectedFlightId(leg) ? 'Seat configuration is unavailable.' : 'Select the flight first.';
      return;
    }
    const occupied = new Set(layout.occupiedSeats);
    const selected = new Set(selections[leg].filter(Boolean));
    const seatGrid = document.createElement('div');
    seatGrid.className = 'd-flex flex-wrap justify-content-center';
    for (const seat of layout.seats) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seat m-1 p-2 border rounded';
      button.textContent = seat.seatNumber;
      button.title = seat.travelClass;
      button.setAttribute('aria-label', `${seat.seatNumber}, ${seat.travelClass}`);
      button.dataset.seat = seat.seatNumber;
      if (occupied.has(seat.seatNumber)) {
        button.disabled = true;
        button.classList.add('occupied', 'bg-secondary', 'text-white');
      } else if (seat.travelClass !== travelClass.value) {
        button.disabled = true;
        button.classList.add('text-muted');
      } else if (selected.has(seat.seatNumber)) {
        button.classList.add('selected', 'bg-warning');
      } else {
        button.classList.add('available');
      }
      button.addEventListener('click', () => selectSeat(leg, seat.seatNumber));
      seatGrid.append(button);
    }
    container.append(seatGrid);
  }

  /** * Handle seat selection for a given flight leg.
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   * @param {string} seatNumber - The seat number to select or deselect.
   */
  function selectSeat(leg, seatNumber) {
    const selected = selections[leg];
    const existingIndex = selected.indexOf(seatNumber);
    if (existingIndex !== -1) {
      selected[existingIndex] = '';
    } else {
      const passengerIndex = selected.findIndex(seat => !seat);
      if (passengerIndex === -1) return formError('Each passenger already has a seat for this flight.');
      selected[passengerIndex] = seatNumber;
    }
    selections[leg] = selected;
    const labelClass = leg === 'outbound' ? '.seat-label-outbound' : '.seat-label-returning';
    passengerFields.querySelectorAll('.card').forEach((card, index) => {
      const label = card.querySelector(labelClass);
      if (label) label.textContent = selected[index] || 'Not selected';
    });
    renderSeatMap(leg);
    updateSummary();
  }


  /** * Load seat availability for a given flight leg.
   * @param {string} leg - The flight leg ('outbound' or 'returning').
   */
  async function loadSeats(leg) {
    const flightId = selectedFlightId(leg);
    layouts[leg] = null;
    selections[leg] = Array(Number(passengerCount?.value || 1)).fill('');
    if (!flightId) {
      renderSeatMap(leg);
      updateSummary();
      return;
    }
    const url = new URL(`/reservations/seats/${encodeURIComponent(flightId)}`, window.location.origin);
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || !data.success) {
      renderSeatMap(leg);
      formError(data.message || 'Unable to load seat availability.');
      return;
    }
    layouts[leg] = data;
    renderSeatMap(leg);
    updateSummary();
  }

  /** * Update the reservation summary, including fares, meal fees, baggage fees, and total price.
   */
  function updateSummary() {
    const count = passengerData.length;
    const meal = [...passengerFields.querySelectorAll('.passenger-meal')]
      .filter(select => select.value !== 'None').length * 150;
    const baggage = [...passengerFields.querySelectorAll('.passenger-baggage')]
      .reduce((sum, input) => sum + (Number(input.value) || 0) * 50, 0);
    const seatTariff = {
      First: 5000,
      Business: 3000,
      'Premium Economy': 1700,
      Economy: 1500
    }[travelClass.value] || 0;
    const outboundSeats = selections.outbound.filter(Boolean).length;
    const returnSeats = tripType.value === 'Round-Trip' ? selections.returning.filter(Boolean).length : 0;
    const outboundFare = selectedFare('outbound');
    const returnFare = tripType.value === 'Round-Trip' ? selectedFare('returning') : 0;
    const total = (outboundFare + returnFare) * count + meal + baggage +
      seatTariff * (outboundSeats + returnSeats);
    document.querySelector('#baseFare').textContent = String(outboundFare);
    document.querySelector('#returnFare').textContent = String(returnFare);
    document.querySelector('#mealFee').textContent = String(meal);
    document.querySelector('#baggageFee').textContent = String(baggage);
    document.querySelector('#seatFee').textContent = String(seatTariff * (outboundSeats + returnSeats));
    document.querySelector('#totalPrice').textContent = String(total);
  }


  /** * Load available flights based on selected origin and destination.
   */
  async function loadFlights() {
    const origin = outboundSelect
      ? document.querySelector('#origin').value
      : fixedOutbound?.dataset.origin;
    const destination = outboundSelect
      ? document.querySelector('#destination').value
      : fixedOutbound?.dataset.destination;
    if (!origin || !destination) return;
    try {
      if (outboundSelect) {
        const url = new URL('/reservations/search', window.location.origin);
        url.search = new URLSearchParams({ origin, destination });
        const response = await fetch(url);
        const data = await response.json();
        outboundSelect.replaceChildren(new Option('-- Choose Outbound Flight --', ''));
        for (const flight of data.flights || []) {
          const option = new Option(
            `${flight.origin} → ${flight.destination} | ₱${flight.price} (${flight.departureDate} ${flight.departureTime})`,
            flight._id
          );
          option.dataset.price = String(flight.price);
          outboundSelect.add(option);
        }
        document.querySelector('#flightSelection')?.classList.remove('d-none');
      }
      if (returnSelect && tripType.value === 'Round-Trip') {
        const reverseUrl = new URL('/reservations/search', window.location.origin);
        reverseUrl.search = new URLSearchParams({ origin: destination, destination: origin });
        const reverseResponse = await fetch(reverseUrl);
        const reverseData = await reverseResponse.json();
        returnSelect.replaceChildren(new Option('-- Choose Return Flight --', ''));
        for (const flight of reverseData.flights || []) {
          const option = new Option(
            `${flight.origin} → ${flight.destination} | ₱${flight.price} (${flight.departureDate} ${flight.departureTime})`,
            flight._id
          );
          option.dataset.price = String(flight.price);
          returnSelect.add(option);
        }
      }
    } catch {
      formError('Unable to load available flights.');
    }
  }


  // Event listeners
  passengerCount?.addEventListener('change', renderPassengers);
  travelClass?.addEventListener('change', () => {
    selections.outbound.fill('');
    selections.returning.fill('');
    renderSeatMap('outbound');
    renderSeatMap('returning');
    updateSummary();
  });
  tripType?.addEventListener('change', async () => {
    const roundTrip = tripType.value === 'Round-Trip';
    returnSection?.classList.toggle('d-none', !roundTrip);
    returnMapSection?.classList.toggle('d-none', !roundTrip);
    if (!roundTrip && returnSelect) returnSelect.value = '';
    if (roundTrip) await loadFlights();
    if (roundTrip && selectedFlightId('returning')) await loadSeats('returning');
    updateSummary();
  });
  document.querySelector('#origin')?.addEventListener('change', loadFlights);
  document.querySelector('#destination')?.addEventListener('change', loadFlights);
  outboundSelect?.addEventListener('change', () => {
    form.classList.toggle('d-none', !outboundSelect.value);
    loadSeats('outbound');
  });
  returnSelect?.addEventListener('change', () => loadSeats('returning'));
  passengerFields.addEventListener('input', updateSummary);
  passengerFields.addEventListener('change', updateSummary);


  /** * Handle form submission for creating a reservation.
   * @param {Event} event - The form submission event.
   */
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!selectedFlightId('outbound') ||
        (tripType.value === 'Round-Trip' && !selectedFlightId('returning'))) {
      return formError('Select the required flight(s).');
    }


    // Validate that each passenger has a seat selected for each flight leg
    const cards = [...passengerFields.querySelectorAll('.card')];
    if (selections.outbound.some(seat => !seat) ||
        (tripType.value === 'Round-Trip' && selections.returning.some(seat => !seat))) {
      return formError('Select one seat per passenger for every flight leg.');
    }

    // Prepare the payload for submission
    const passengers = cards.map((card, index) => ({
      fullName: card.querySelector('.passenger-name').value.trim(),
      age: Number(card.querySelector('.passenger-age').value),
      gender: card.querySelector('.passenger-gender').value,
      passport: card.querySelector('.passenger-passport').value.trim(),
      meal: card.querySelector('.passenger-meal').value,
      baggageAllowance: Number(card.querySelector('.passenger-baggage').value),
      seatNumber: selections.outbound[index],
      ...(tripType.value === 'Round-Trip' ? { returnSeatNumber: selections.returning[index] } : {})
    }));
    const payload = {
      flight: selectedFlightId('outbound'),
      ...(tripType.value === 'Round-Trip' ? { returnFlight: selectedFlightId('returning') } : {}),
      tripType: tripType.value,
      travelClass: travelClass.value,
      passengers,
      totalAmount: Number(document.querySelector('#totalPrice').textContent)
    };
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch('/reservations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        formError(result.message || 'Unable to create reservation.');
        return;
      }
      window.location.assign(result.redirect);
    } catch {
      formError('Unable to submit reservation.');
    } finally {
      button.disabled = false;
    }
  });

  renderPassengers();
  if (outboundSelect) {
    form.classList.add('d-none');
  } else {
    loadSeats('outbound');
  }
  if (tripType.value === 'Round-Trip') {
    returnMapSection?.classList.remove('d-none');
    if (selectedFlightId('returning')) loadSeats('returning');
  }
});
