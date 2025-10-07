let reservations = [];

// Load existing bookings
function loadBookings() {
  const data = localStorage.getItem("archersBookings");
  reservations = data ? JSON.parse(data) : [];
  renderReservations();
}

// Save bookings
function saveBookings() {
  localStorage.setItem("archersBookings", JSON.stringify(reservations));
}

// Render bookings in card style
function renderReservations() {
  const list = $("#reservationList");
  list.empty();

  if (reservations.length === 0) {
    list.append('<p class="text-center text-muted">No booked flights yet.</p>');
    return;
  }

  reservations.forEach(r => {
    list.append(`
      <div class="col-md-6 col-lg-4">
        <div class="booking-card">
          <h6 class="title mb-2">${r.flightNumber} — ${r.origin} → ${r.destination}</h6>
          <p class="mb-1"><strong>Passenger:</strong> ${r.passengerName}</p>
          <p class="mb-1"><strong>Seat:</strong> ${r.seat}</p>
          <p class="mb-1"><strong>Total:</strong> ₱${r.totalCost.toLocaleString()}</p>
          <div class="mt-3 d-flex justify-content-between">
            <button class="btn btn-sm btn-outline-danger" onclick="viewReservation(${r.id})">
              <i class="bi bi-eye me-1"></i>View
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="cancelReservation(${r.id})">
              <i class="bi bi-x-circle me-1"></i>Cancel
            </button>
          </div>
        </div>
      </div>
    `);
  });
}

// View booking details
function viewReservation(id) {
  const r = reservations.find(x => x.id === id);
  if (!r) return;

  $("#reservationDetails").html(`
    <p><strong>Passenger:</strong> ${r.passengerName}</p>
    <p><strong>Flight Number:</strong> ${r.flightNumber}</p>
    <p><strong>Route:</strong> ${r.origin} → ${r.destination}</p>
    <p><strong>Seat:</strong> ${r.seat}</p>
    <p><strong>Total Cost:</strong> ₱${r.totalCost.toLocaleString()}</p>
  `);

  new bootstrap.Modal(document.getElementById("reservationModal")).show();
}

// Cancel booking
function cancelReservation(id) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;

  const booking = reservations.find(b => b.id === id);
  if (booking) {
    // Remove seat from booked list
    let bookedSeats = JSON.parse(localStorage.getItem("archersBookedSeats")) || {};
    if (bookedSeats[booking.flightNumber]) {
      bookedSeats[booking.flightNumber] = bookedSeats[booking.flightNumber].filter(s => s !== booking.seat);
      localStorage.setItem("archersBookedSeats", JSON.stringify(bookedSeats));
    }
  }

  // Remove from list
  reservations = reservations.filter(b => b.id !== id);
  saveBookings();
  renderReservations();

  alert("Booking successfully cancelled.");
}

// Confirm checkout
$("#confirmCheckoutBtn").on("click", function (e) {
  e.preventDefault();

  const passengerName = $("#passengerName").val().trim();
  const flightNumber = $("#flightNumber").val().trim();
  const route = $("#route").val().split(" → ");
  const seat = $("#seat").val().trim();
  const totalCost = $("#totalCost").val().trim();

  if (!passengerName || !flightNumber || !totalCost) {
    alert("Please fill out all required fields.");
    return;
  }

  const newBooking = {
    id: Date.now(),
    passengerName,
    flightNumber,
    origin: route[0] || "N/A",
    destination: route[1] || "N/A",
    seat,
    totalCost: Number(totalCost)
  };

  reservations.push(newBooking);
  saveBookings();
  renderReservations();
  markSeatAsBooked(flightNumber, seat);

  localStorage.removeItem("archersPendingBooking");
  $("#checkoutForm")[0].reset();

  alert(`Booking confirmed for ${passengerName}!`);
});

// Mark seat as booked
function markSeatAsBooked(flightNumber, seat) {
  let data = JSON.parse(localStorage.getItem("archersBookedSeats")) || {};
  if (!data[flightNumber]) data[flightNumber] = [];
  if (!data[flightNumber].includes(seat)) data[flightNumber].push(seat);
  localStorage.setItem("archersBookedSeats", JSON.stringify(data));
}

// Load pending booking from reservation page
function loadPendingBooking() {
  const pending = JSON.parse(localStorage.getItem("archersPendingBooking"));
  if (pending) {
    $("#flightNumber").val(pending.flightNumber || "");
    $("#route").val(`${pending.origin || ""} → ${pending.destination || ""}`);
    $("#seat").val(pending.seat || "");
    $("#totalCost").val(pending.totalCost || "");
  }
}

// Initialize
$(document).ready(() => {
  loadBookings();
  loadPendingBooking();
});
