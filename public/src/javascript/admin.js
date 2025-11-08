let flights = [
  { number: "PR1001", origin: "Manila", destination: "Cebu", date: "2025-10-15" },
  { number: "PR2002", origin: "Manila", destination: "Hong Kong", date: "2025-10-18" }
];

function renderFlights() {
  const tbody = $("#flightTableBody");
  tbody.empty();

  if (flights.length === 0) {
    tbody.append('<tr><td colspan="4" class="text-center text-muted">No flights available.</td></tr>');
    return;
  }

  flights.forEach(f => {
    tbody.append(`
      <tr>
        <td>${f.number}</td>
        <td>${f.origin}</td>
        <td>${f.destination}</td>
        <td>${f.date}</td>
      </tr>
    `);
  });
}

$("#saveFlightBtn").on("click", function () {
  const number = $("#flightNumber").val().trim();
  const origin = $("#origin").val().trim();
  const destination = $("#destination").val().trim();
  const date = $("#flightDate").val();

  if (!number || !origin || !destination || !date) {
    alert("Please fill in all fields.");
    return;
  }

  flights.push({ number, origin, destination, date });
  renderFlights();

  $("#addFlightForm")[0].reset();
  const modal = bootstrap.Modal.getInstance(document.getElementById("addFlightModal"));
  modal.hide();

  alert("Flight added successfully (in memory only).");
});

$("#manageUsersBtn").on("click", function () {
  alert("Manage Users feature coming soon.");
});

$(document).ready(renderFlights);
