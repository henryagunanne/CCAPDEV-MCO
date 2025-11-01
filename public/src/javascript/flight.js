jQuery(function() {

    // Initialize the carousel
    $("#locationCarousel").carousel({
        interval: 3000, // Change slide every 3 seconds
    });

    $("#popularDestCarousel").carousel({
        interval: 3000
    });
    
    // update departure and return date attribute field on focus to date form text
    $("#departureDate, #returnDate").on("focus", function() {
        $(this).attr("type", "date");
    });
    
    // update departure and return date attribute field on blur back to text
    $("#departureDate, #returnDate").on("blur", function() {
        if (!$(this).val()) {
            $(this).attr("type", "text");
        }
    });

    /* ---------- Handle Return Date Disabling ---------- */
    function toggleReturnDate (){
        let returnDate = $("#returnDate");
        let tripType = $("#tripDropdown .dropdown-toggle").text().trim();
        
        if(tripType === "One-Way"){
        returnDate.prop("disabled", true); // disable
        } else {
        returnDate.prop("disabled", false);
        }
    }


    /* ---------- Trip Type dropdowm ---------- */
    // constant variables for the trip type dropdown 
    const $trip = $("#tripDropdown"); // Dropdown container
    const $toggle = $trip.find(".dropdown-toggle"); // Dropdown toggle button
    const $options = $trip.find(".dropdown-item"); // Dropdown items

    // Add click event listener to each dropdown item
    $options.on("click", function () {
        const selected = $(this).text(); // Get the text of the clicked option

        $toggle.text(selected); // Update the dropdown toggle text
        $("#tripTypeInput").val(selected); // Update hidden input value

        // Mark as valid visually
        $("#tripTypeInput")[0].setCustomValidity('');
        $("#tripTypeInput").removeClass('is-invalid').addClass('is-valid');

        toggleReturnDate(); 
    });

    /* ---------- Passenger & Cabin dropdown ---------- */
    // constant variables for the cabin selection dropdown
    const $passenger = $("#passengerDropdown"); // Dropdown container
    const $travelClass = $("#travelClass"); // Dropdown items
    const $value = $passenger.find(".dropdown-toggle"); // Dropdown toggle button
    
    // update passenger number and Cabin selection
    function updateLabel() {
        let totalPassengers = 0;
        $passenger.find(".counter .value").each(function() {
            totalPassengers += parseInt($(this).text());
        });

        //update hidden input field for number of passengers
        $("#passengers").val(totalPassengers);

        // Update the label text
        const passengerText = totalPassengers === 1 ? "1 Passenger" : totalPassengers + " Passengers";

        $value.text(`${passengerText}, ${$travelClass.find("option:selected").text()}`);
    }

    // Handle +/− buttons
    $passenger.find(".counter").each(function() {
        const $counter = $(this);
        const $ctr = $counter.find(".value");
        const $plus = $counter.find('.plus');
        const $minus = $counter.find('.minus');

        $minus.on("click", function(e) {
            e.stopPropagation();
            let num = parseInt($ctr.text());
            if (num > 0) {
                $ctr.text(num - 1);
                updateLabel();
            }
        });

        $plus.on("click", function(e) {
            e.stopPropagation();
            let num = parseInt($ctr.text());
            $ctr.text(num + 1);
            updateLabel();
        });
    });

    // Update when travel class changes
    $travelClass.on("change", updateLabel);

    //initialize
    updateLabel();


    /* ---------- Origin Selection dropdowm ---------- */
    // Handle switching countries
    $("#countries li").on("click", function(e){
        e.stopPropagation();
        const origin = $(this).data("country");

        // Highlight active country
        $("#countries li").removeClass("active");
        $(this).addClass("active");

        // Show relevant cities
        $("#cities ul").addClass("d-none");
        $(`#cities ul[data-country='${origin}']`).removeClass("d-none");
    });

    // Handle city selection
    $("#cities li").on("click", function(){
        const city = $(this).text();
        $("#originDropdown .dropdown-toggle").text(city);
        //bootstrap.Dropdown.getInstance($("#originDropdown button")[0]).hide(); // close menu

        $("#originInput").val(city);
        $("#originInput")[0].setCustomValidity('');
        $("#originInput").removeClass('is-invalid').addClass('is-valid');
    });

    /* ---------- Destination Selection dropdowm ---------- */
    // Handle switching countries
    $("#countryList li").on("click", function(e){
        e.stopPropagation();
        const destination = $(this).data("country");

        // Highlight the selected Country
        $("#countryList li").removeClass("active");
        $(this).addClass("active");

        // Display related cities
        $("#cityList ul").addClass("d-none");
        $(`#cityList ul[data-country='${destination}']`).removeClass("d-none");
    });

    // Handle City Selection 
    $("#cityList li").on("click", function(){
        const city = $(this).text();
        $("#destinationDropdown .dropdown-toggle").text(city);
        bootstrap.Dropdown.getInstance($("#destinationDropdown button")[0]).hide(); // close menu

        $("#destinationInput").val(city);
        $("#destinationInput")[0].setCustomValidity('');
        $("#destinationInput").removeClass('is-invalid').addClass('is-valid');
    });


    // Select flight search form for validation
    const $flightSearch = $('.flightSearch .needs-validation');

    // On form submission
    $flightSearch.on('submit', function (event) {
        // Validate hidden inputs (Trip, Origin, Destination)
        if (!$("#tripTypeInput").val()) {
            $("#tripTypeInput")[0].setCustomValidity('Please select a trip type.');
            $("#tripTypeInput").addClass('is-invalid');
        }
        if (!$("#originInput").val()) {
            $("#originInput")[0].setCustomValidity('Please select an origin.');
            $("#originInput").addClass('is-invalid');
        }
        if (!$("#destinationInput").val()) {
            $("#destinationInput")[0].setCustomValidity('Please select a destination.');
            $("#destinationInput").addClass('is-invalid');
        }

        // Block submission if invalid
        if (this.checkValidity() === false) {
            event.preventDefault();
            event.stopPropagation();
        }

        $flightSearch.addClass('was-validated');

        /*
        /* ---------- AJAX Flight Search ---------- /
       event.preventDefault(); // stop default page reload

        const query = $(this).serialize(); // grab all form data
        console.log("Searching flights with:", query);
    
        // Show loading state
        $('#searchResultsContainer').html('<p class="text-center text-muted">Searching flights...</p>');
    
        // Perform AJAX GET request
        $.ajax({
          url: '/flights/search',
          method: 'GET',
          data: query,
          success: function (data) {
            // data is the rendered HTML from res.render()
            $('#searchResultsContainer').html(data);
          },
          error: function (xhr) {
            let message = 'An error occurred while searching for flights.';
            if (xhr.status === 404) {
              message = 'No flights found for the given criteria.';
            }
            $('#searchResultsContainer').html(`<p class="text-center text-danger">${message}</p>`);
          }
        });
        */
    });


});