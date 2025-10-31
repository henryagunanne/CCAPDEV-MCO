// ====================== In-Memory Reservation Data ======================
let reservations = [
  { id: 1, name: "John Doe", flight: "MNL → HKG", date: "2025-10-20", seat: "12A" },
  { id: 2, name: "Jane Smith", flight: "MNL → TPE", date: "2025-10-24", seat: "15C" }
];

// Render the reservation list dynamically
function renderReservations() {
  const list = $("#reservationList");
  list.empty();

  if (reservations.length === 0) {
    list.append('<li class="list-group-item text-muted">No reservations found.</li>');
    return;
  }

  reservations.forEach(r => {
    list.append(`
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div><strong>${r.name}</strong> — ${r.flight} (${r.date})</div>
        <button class="btn btn-sm btn-outline-danger" onclick="viewReservation(${r.id})">View</button>
      </li>
    `);
  });
}

// Show reservation details in modal
function viewReservation(id) {
  const r = reservations.find(x => x.id === id);
  if (!r) return;

  $("#reservationDetails").html(`
    <p><strong>Passenger:</strong> ${r.name}</p>
    <p><strong>Flight:</strong> ${r.flight}</p>
    <p><strong>Date:</strong> ${r.date}</p>
    <p><strong>Seat:</strong> ${r.seat}</p>
  `);

  new bootstrap.Modal(document.getElementById("reservationModal")).show();
}

// Initialize on page load
$(document).ready(renderReservations);
