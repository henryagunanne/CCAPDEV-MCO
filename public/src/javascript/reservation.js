$(document).ready(function () {
  const baseFare = parseInt($("#baseFare").text());
  const mealPrice = 150;
  const bagPrice = 50;
  const seatPricing = { first: 5000, business: 3000, economy: 1500 };
  const seatClasses = { 1: "first", 2: "first", 3: "business", 4: "business" };
  
  let passengers = [];
  let selectedSeats = [];

  // -------- Passenger Generator --------
  $("#passengerCount").on("input", function () {
    const count = parseInt($(this).val());
    const container = $("#passengerFields");
    container.empty();
    passengers = [];

    for (let i = 1; i <= count; i++) {
      passengers.push({ seat: null, meal: "None", baggage: 0 });

      container.append(`
        <div class="card my-3 shadow-sm">
          <div class="card-header bg-light"><strong>Passenger ${i}</strong></div>
          <div class="card-body">
            <div class="row mb-2">
  <div class="col-md-4">
    <label class="form-label">Full Name</label>
    <input type="text" name="passengers[${i - 1}][fullName]" class="form-control" required>
  </div>
  <div class="col-md-4">
    <label class="form-label">Age</label>
    <input type="number" name="passengers[${i - 1}][age]" class="form-control" min="0" required>
  </div>
  <div class="col-md-4">
    <label class="form-label">Gender</label>
    <select name="passengers[${i - 1}][gender]" class="form-select" required>
      <option value="">Select</option>
      <option value="Male">Male</option>
      <option value="Female">Female</option>
      <option value="Other">Other</option>
    </select>
  </div>
</div>

<div class="row mb-2">
  <div class="col-md-6">
    <label class="form-label">Email</label>
    <input type="email" name="passengers[${i - 1}][email]" class="form-control" required>
  </div>
  <div class="col-md-6">
    <label class="form-label">Passport Number</label>
    <input type="text" name="passengers[${i - 1}][passport]" class="form-control" required>
  </div>
</div>


            <div class="row">
              <div class="col-md-6">
                <label class="form-label">Meal Option</label>
                <select name="passengers[${i - 1}][meal]" class="form-select meal-option" data-index="${i - 1}">
                  <option value="None">None</option>
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Non-Vegetarian">Non-Vegetarian</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Gluten-Free">Gluten-Free</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Baggage (kg)</label>
                <input type="number" class="form-control baggage-input" data-index="${i - 1}" min="0" value="0" name="passengers[${i - 1}][baggageAllowance]">
              </div>
            </div>
            <div class="mt-2 text-muted small seat-info">Seat: None</div>
          </div>
        </div>
      `);
    }

    updateSummary();
  }).trigger("input");

  // -------- Seat Map Generation --------
  for (let row = 1; row <= 10; row++) {
    ["A", "B", "C", "D", "E", "F"].forEach(function (col) {
      const seatClass = seatClasses[row] || "economy";
      const occupied = Math.random() < 0.15;

      const seat = $("<div>")
        .addClass("seat")
        .addClass(occupied ? "occupied" : `${seatClass} available`)
        .text(row + col)
        .attr("data-id", row + col)
        .attr("data-price", seatPricing[seatClass])
        .attr("data-class", seatClass);

      if (col === "C") $("#seat-map").append(seat).append("<div class='aisle'></div>");
      else $("#seat-map").append(seat);
    });
  }

  // -------- Seat Selection (1 per Passenger) --------
  $(document).on("click", ".seat.available", function () {
    const seatId = $(this).data("id");
    const seatPrice = parseInt($(this).data("price"));
    const seatClass = $(this).data("class");

    const nextPassenger = passengers.findIndex(p => p.seat === null);
    if (nextPassenger === -1) {
      alert("All passengers already have seats!");
      return;
    }

    $(this).removeClass("available").addClass("selected");
    passengers[nextPassenger].seat = { id: seatId, price: seatPrice, class: seatClass };
    $(`#passengerFields .card:eq(${nextPassenger}) .seat-info`).text(`Seat: ${seatId}`);

    updateSummary();
  });

  // -------- Meal/Baggage Change --------
  $(document).on("change input", ".meal-option, .baggage-input", function () {
    const index = $(this).data("index");
    if ($(this).hasClass("meal-option")) passengers[index].meal = $(this).val();
    else passengers[index].baggage = parseInt($(this).val()) || 0;
    updateSummary();
  });

  // -------- Price Summary --------
  function updateSummary() {
    const mealFee = passengers.reduce((sum, p) => sum + (p.meal !== "None" ? mealPrice : 0), 0);
    const bagFee = passengers.reduce((sum, p) => sum + (p.baggage * bagPrice || 0), 0);
    const seatFee = passengers.reduce((sum, p) => sum + (p.seat ? p.seat.price : 0), 0);
    const total = (baseFare * passengers.length) + mealFee + bagFee + seatFee;

    $("#mealFee").text(mealFee);
    $("#baggageFee").text(bagFee);
    $("#seatFee").text(seatFee);
    $("#totalPrice").text(total);
  }

// -------- Submit Booking --------
$("#confirmBooking").on("click", function (e) {
  e.preventDefault();

  // Build passengers array from form cards
  const passengerData = [];
  $("#passengerFields .card").each(function () {
    const passenger = {
  fullName: $(this).find("input[name*='fullName']").val(),
  age: parseInt($(this).find("input[name*='age']").val()) || 0,
  gender: $(this).find("select[name*='gender']").val(),
  email: $(this).find("input[name*='email']").val(),
  passport: $(this).find("input[name*='passport']").val(),
  seatNumber: $(this).find(".seat-info").text().replace("Seat: ", "").trim(),
  meal: $(this).find("select[name*='meal']").val(),
  baggageAllowance: parseInt($(this).find("input[name*='baggageAllowance']").val()) || 0
};

    passengerData.push(passenger);
  });

  console.log("📦 Passenger Data:", passengerData);


  // Compute total from summary
  const totalAmount = parseFloat($("#totalPrice").text()) || 0;

  // ✅ FIXED JSON REQUEST
  $.ajax({
    url: "/reservations/create",
    method: "POST",
    contentType: "application/json", // send as JSON
    data: JSON.stringify({
      flight: $("input[name='flight']").val(),
      travelClass: $("#travelClass").val(),
      passengers: passengerData,
      totalAmount: totalAmount
    }),
    success: function (response) {
      window.location.href = response.redirect || window.location.href;
    },
    error: function (xhr, status, err) {
      console.error("Error submitting reservation:", err);
      alert("An error occurred while submitting your booking.");
    }
  });
});
});
