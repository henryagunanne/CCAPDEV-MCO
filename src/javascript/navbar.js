jQuery(function() {
    'use strict';

    // load navbar
    $("#navbar").load("navbar.html", function() {

        // Move modals from the navbar container to the body
        $(".modal").appendTo("body");
        
        // Handle Sign In click
        $(".login").on("click", function() {
            let loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
            loginModal.show();
        });

        // Handle Create account click
        $(".create").on("click", function() {
            let signUpModal = new bootstrap.Modal(document.getElementById("signUpModal"));
            signUpModal.show();
        });
    });

    // Create account form interaction Handling
    $("#noFirstname").on("change", function() {
        if ($(this).is(":checked")) {
          $("#firstname").prop("disabled", true);
        } else {
          $("#firstname").prop("disabled", false);
        }
    });

    let password = $("#password").val();
    let confirmPassword = $("#confirmPassword").val();
    if (confirmPassword === "") {
        $(".confirmPassword .invalid-feedback").text("Please confirm your password");
    } else if (password !== confirmPassword) {
        $(".confirmPassword .invalid-feedback").text("Passwords do not match");
    } else {
        $(".confirmPassword .invalid-feedback").text(""); // Clear feedback if passwords match
    }


    // Select all forms that need validation
    const $forms = $('.needs-validation');

    // Loop over each form
    $forms.each(function () {
        const $form = $(this);

        // On form submission
        $form.on('submit', function (event) {
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

            $form.addClass('was-validated');
        });
    });

});