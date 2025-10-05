jQuery(function () {
    // ---------- Seat Pricing ----------
    const seatPricing = { first: 5000, business: 3000, economy: 1500 };

    let seats = [];       // all generated seats
    let selected = [];    // currently selected seats

    // ---------- Seat Class Mapping ----------
    // Rows 1-2 = First, 3-4 = Business, rest = Economy
    const seatClasses = { 1: "first", 2: "first", 3: "business", 4: "business" };

    // ---------- Generate Seats ----------
    // Rows 1 to 10, Columns A-F
    for (let row = 1; row <= 10; row++) {
        ["A", "B", "C", "D", "E", "F"].forEach(function (col) {
            const seatClass = seatClasses[row] || "economy";
            const occupied = Math.random() < 0.15; // 15% chance occupied

            seats.push({
                id: row + col,
                class: seatClass,
                price: seatPricing[seatClass],
                occupied: occupied
            });
        });
    }

    // ---------- Render Seat Map ----------
    seats.forEach(function (seat) {
        let $seatDiv = $("<div>")
            .addClass("seat")
            .addClass(seat.occupied ? "occupied" : "available")
            .addClass(seat.class)
            .text(seat.id)
            .attr("data-id", seat.id)
            .attr("data-price", seat.price)
            .attr("data-class", seat.class);

        // Add aisle after C
        if (seat.id.endsWith("C")) {
            $("#seat-map").append($seatDiv).append("<div class='aisle'></div>");
        } else {
            $("#seat-map").append($seatDiv);
        }
    });

    // ---------- Seat Selection ----------
    $(document).on("click", ".seat.available", function () {
        const seatId = $(this).data("id");
        const seatPrice = parseInt($(this).data("price"));
        const seatClass = $(this).data("class");

        if ($(this).hasClass("selected")) {
            // Deselect seat
            $(this).removeClass("selected").addClass("available");
            selected = selected.filter(function (s) { return s.id !== seatId; });
        } else {
            // Select seat
            $(this).removeClass("available").addClass("selected");
            selected.push({ id: seatId, price: seatPrice, seatClass: seatClass });
        }

        updateSummary();
    });

    // ---------- Clear All Selections ----------
$("#clearBtn").on("click", function () {
    if (selected.length === 0) {
        alert("No seats selected.");
        return;
    }

    // Reset selected seats back to available
    selected.forEach(function (s) {
        $(`.seat[data-id='${s.id}']`)
            .removeClass("selected")
            .addClass("available");
    });

    // Clear array + update summary
    selected = [];
    updateSummary();
});


    // ---------- Update Summary ----------
    function updateSummary() {
        $("#seatList").empty();
        let total = 0;

        selected.forEach(function (seat) {
            $("#seatList").append(
                `<li class="list-group-item">${seat.id} (${seat.seatClass}) - ₱${seat.price}</li>`
            );
            total += seat.price;
        });

        $("#totalPrice").text(total);
        $("#selectedSeats").val(selected.map(function (s) { return s.id; }).join(","));
        $("#totalPriceInput").val(total);
    }

    // ---------- Modal Preview ----------
    $("#confirmBtn").on("click", function () {
        $("#modalSeatList").empty();
        let total = 0;

        selected.forEach(function (seat) {
            $("#modalSeatList").append(
                `<li>${seat.id} (${seat.seatClass}) - ₱${seat.price}</li>`
            );
            total += seat.price;
        });

        $("#modalTotalPrice").text(total);
    });

    // ---------- Final Confirmation ----------
    $("#finalizeBtn").on("click", function () {
        if (selected.length === 0) {
            alert("Please select at least one seat.");
            return;
        }

        alert("Reservation confirmed!\nSeats: " +
            selected.map(function (s) { return s.id; }).join(", ") +
            "\nTotal: ₱" + $("#totalPrice").text());

        $("#confirmModal").modal("hide");

        // Mark selected seats as occupied after confirmation
        selected.forEach(function (s) {
            $(`.seat[data-id='${s.id}']`)
                .removeClass("selected")
                .addClass("occupied")
                .off("click"); // disable further selection
        });

        selected = []; // clear selection
        updateSummary();
    });
});
