$(document).ready(function () {
  console.log("🧩 Edit Reservation JS Loaded");

  const mealPrice = 150;
  const bagPrice = 50;
  const seatPricing = { first: 5000, business: 3000, economy: 1500 };
  const seatClasses = { 1: "first", 2: "first", 3: "business", 4: "business" };
  const baseFare = parseInt($("#baseFare").text()) || 0;

  // 🧳 Passenger data from existing cards
  let passengers = [];
  $("#passengerFields .card").each(function (i) {
    passengers.push({
      seat: $(this).find(".seat-info").text().replace("Seat: ", "").trim() || null,
      meal: $(this).find(".meal-option").val(),
      baggage: parseInt($(this).find(".baggage-input").val()) || 0,
    });
  });

  // 🎟️ Build Seat Map
  const seatMap = $("#seat-map").empty();
  for (let row = 1; row <= 10; row++) {
    ["A", "B", "C", "D", "E", "F"].forEach((col) => {
      const seatId = `${row}${col}`;
      const seatClass = seatClasses[row] || "economy";
      const isOccupied = occupiedSeats.includes(seatId);
      const isSelected = passengers.some((p) => p.seat === seatId);

      const seat = $("<div>")
        .addClass("seat")
        .addClass(isOccupied ? "occupied" : `${seatClass} available`)
        .text(seatId)
        .attr("data-id", seatId)
        .attr("data-price", seatPricing[seatClass])
        .attr("data-class", seatClass);

      if (isSelected) seat.addClass("selected"); // ✅ preselect passenger seat
      if (col === "C") seatMap.append(seat).append("<div class='aisle'></div>");
      else seatMap.append(seat);
    });
  }

  // ✈️ Seat click logic
  $(document).on("click", ".seat", function () {
    if ($(this).hasClass("occupied")) {
      alert("⚠️ This seat is already taken.");
      return;
    }

    const seatId = $(this).data("id");
    const seatPrice = parseInt($(this).data("price"));
    const seatClass = $(this).data("class");

    // If selected → unselect
    if ($(this).hasClass("selected")) {
      $(this).removeClass("selected").addClass("available");
      const idx = passengers.findIndex((p) => p.seat === seatId);
      if (idx !== -1) {
        passengers[idx].seat = null;
        $(`#passengerFields .card:eq(${idx}) .seat-info`).text("Seat: None");
      }
      updateSummary();
      return;
    }

    // Find next passenger without seat
    const nextPax = passengers.findIndex((p) => !p.seat);
    if (nextPax === -1) {
      alert("All passengers already have seats!");
      return;
    }

    $(".seat.selected").removeClass("selected").addClass("available");
    $(this).removeClass("available").addClass("selected");

    passengers[nextPax].seat = seatId;
    $(`#passengerFields .card:eq(${nextPax}) .seat-info`).text(`Seat: ${seatId}`);
    updateSummary();
  });

  // 🍱 Meal/Baggage change listener
  $(document).on("change input", ".meal-option, .baggage-input", function () {
    const i = $(this).data("index");
    if ($(this).hasClass("meal-option")) passengers[i].meal = $(this).val();
    else passengers[i].baggage = parseInt($(this).val()) || 0;
    updateSummary();
  });

  // 💰 Price summary
  function updateSummary() {
    const mealFee = passengers.reduce(
      (sum, p) => sum + (p.meal !== "None" ? mealPrice : 0),
      0
    );
    const bagFee = passengers.reduce((sum, p) => sum + p.baggage * bagPrice, 0);
    const seatFee = passengers.reduce(
      (sum, p) => sum + (p.seat ? seatPricing[getSeatClass(p.seat)] : 0),
      0
    );
    const total = baseFare + mealFee + bagFee + seatFee;

    $("#mealFee").text(mealFee);
    $("#baggageFee").text(bagFee);
    $("#seatFee").text(seatFee);
    $("#totalPrice").text(total);
  }

  // helper to get class by seat id
  function getSeatClass(seatId) {
    const row = parseInt(seatId);
    return seatClasses[row] || "economy";
  }

  updateSummary();

  // 📝 Submit update
  $("#editReservationForm").on("submit", function (e) {
    e.preventDefault();

    const passengerData = [];
    $("#passengerFields .card").each(function () {
      passengerData.push({
        fullName: $(this).find("input[name*='fullName']").val(),
        age: parseInt($(this).find("input[name*='age']").val()) || 0,
        gender: $(this).find("select[name*='gender']").val(),
        passport: $(this).find("input[name*='passport']").val(),
        seatNumber: $(this).find(".seat-info").text().replace("Seat: ", "").trim(),
        meal: $(this).find(".meal-option").val(),
        baggageAllowance:
          parseInt($(this).find(".baggage-input").val()) || 0,
      });
    });

    const totalPrice = parseInt($("#totalPrice").text()) || 0;

    $.ajax({
      url: `/reservations/update/${$("input[name='reservationId']").val()}`,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ passengers: passengerData, totalPrice }),
      success: function () {
        alert("✅ Reservation updated successfully!");
        window.location.href = "/reservations/my-bookings";
      },
      error: function (err) {
        console.error("❌ Error saving:", err);
        alert("Error saving reservation. Please try again.");
      },
    });
  });
});
