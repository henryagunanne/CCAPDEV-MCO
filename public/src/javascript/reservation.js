$(document).ready(function () {

  // Base pricing
  const baseFare = 1500;
  const mealPrice = 150;
  const bagPrice = 50;

  // Seat pricing and classes
  const seatPricing = { first: 5000, business: 3000, economy: 1500 };
  const seatClasses = { 1: "first", 2: "first", 3: "business", 4: "business" };

  let selected = [];

  // -------- Generate Seat Map --------
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

// -------- Seat Selection (Toggle + Hidden Input Update) --------
$(document).on("click", ".seat", function () {
  if ($(this).hasClass("occupied")) return; // disable occupied seats

  const seatId = $(this).data("id");
  const seatPrice = parseInt($(this).data("price"));
  const seatClass = $(this).data("class");

  // Deselect any previously selected seat
  $(".seat.selected").removeClass("selected").addClass("available");
  selected = [];

  // Select this seat
  $(this).addClass("selected").removeClass("available");
  selected.push({ id: seatId, price: seatPrice, seatClass });

  // ✅ Update hidden form fields
  $("#seatNumber").val(seatId);
  $("#travelClass").val(seatClass.charAt(0).toUpperCase() + seatClass.slice(1));

  console.log("✅ Seat selected:", seatId, "| Class:", seatClass);

  updateSummary();
});


  // -------- Update Summary --------
  function updateSummary() {
    const mealFee = ($("#meal").val() !== "standard") ? mealPrice : 0;
    const bagFee = ($("#baggage").val() * bagPrice);
    const seatFee = selected.reduce((sum, s) => sum + s.price, 0);
    const total = baseFare + seatFee + mealFee + bagFee;

    $("#mealFee").text(mealFee);
    $("#baggageFee").text(bagFee);
    $("#seatFee").text(seatFee);
    $("#totalPrice").text(total);
  }

  // -------- Event Listeners --------
  $("#meal, #baggage").on("change input", updateSummary);

  // -------- Input Validation --------
function validateInputs() {
  const name = $("#name").val().trim();
  const email = $("#email").val().trim();
  const passport = $("#passport").val().trim();

  const namePattern = /^[A-Za-z\s]{2,}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passportPattern = /^[A-Za-z0-9]{6,9}$/;

  let valid = true;

  // Name
  if (!namePattern.test(name)) {
    $("#name").addClass("is-invalid").removeClass("is-valid");
    valid = false;
  } else {
    $("#name").addClass("is-valid").removeClass("is-invalid");
  }

  // Email
  if (!emailPattern.test(email)) {
    $("#email").addClass("is-invalid").removeClass("is-valid");
    valid = false;
  } else {
    $("#email").addClass("is-valid").removeClass("is-invalid");
  }

  // Passport
  if (!passportPattern.test(passport)) {
    $("#passport").addClass("is-invalid").removeClass("is-valid");
    valid = false;
  } else {
    $("#passport").addClass("is-valid").removeClass("is-invalid");
  }

  return valid;
}


  // -------- Booking Confirmation --------
  $("#confirmBooking").on("click", function () {
    const isValid = validateInputs();

    if (!isValid) return;

    if (selected.length === 0) {
      $("#formMessage").removeClass("text-success").addClass("text-danger").text("Please select at least one seat.");
      return;
    }

    const total = $("#totalPrice").text();
    const name = $("#name").val().trim();

    $("#formMessage")
      .removeClass("text-danger")
      .addClass("text-success")
      .html(`Booking confirmed for <strong>${name}</strong>! Total Price: ₱${total}`);

    // Mark selected seats as occupied
    selected.forEach(s => {
      $(`.seat[data-id='${s.id}']`).removeClass("selected available").addClass("occupied").off("click");
    });

    selected = [];
    updateSummary();
  });

});
