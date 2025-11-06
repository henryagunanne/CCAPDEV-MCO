jQuery(function() {
    'use strict';

   
    // Move modals from the navbar container to the body
    $(".modal").appendTo("body");
    
    /* Create account form interaction Handling
    $("#noFirstName").on("change", function() {
        if ($(this).is(":checked")) {
            $("#firstName").prop("disabled", true);
        } else {
            $("#firstName").prop("disabled", false);
        }
    }); */

    // Ensure passwords are identical
    $("#confirmPassword").on("input", function () {
        let password = $("#password").val();
        let confirmPassword = $(this).val();

        if (confirmPassword === "") {
            $(".confirmPassword .invalid-feedback").text("Please confirm your password");
        } else if (password !== confirmPassword) {
            $(".confirmPassword .invalid-feedback").text("Passwords do not match");
        } else {
            $(".confirmPassword .invalid-feedback").text(""); // Clear feedback if passwords match
        }
    });

    // Select all forms that need validation
    const $forms = $('.needs-validation');

    // Loop over each form
    $forms.each(function () {
        const $form = $(this);

        // On form submission
        $form.on('submit', function (event) {
            // Block submission if invalid
            if (this.checkValidity() === false) {
                event.preventDefault();
                event.stopPropagation();
            }

            $form.addClass('was-validated');
        });
    });


    // login form submission handling
    $("#loginForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const $form = $(this);

        // Check form validity
        if (this.checkValidity() === false) {
            event.stopPropagation();
            $form.addClass('was-validated');
            return;
        }

        const formData = {
            email: $("#loginEmail").val(),
            password: $("#loginPassword").val()
        };

        // AJAX POST request for login
        $.ajax({
            type: "POST",
            url: "/users/login",
            data: JSON.stringify(formData),
            contentType: "application/json",
            success: function(res) {
                if (res.success) {
                    alert(res.message).show();
                    $('#loginModal').modal('hide');
                    location.reload();
                } else {
                    $('#loginError').text(res.message).show();
                }
            },
            error: function(xhr) {
                // Show error message on failure
                const msg = xhr.responseText || "⚠️ Login failed. Please try again.";
                $("#loginError").text(msg).show();
            }
        });
    });

    // registration form submission handling
    $("#registerForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const $form = $(this);

        // Check form validity
        if (this.checkValidity() === false) {
            event.stopPropagation();
            $form.addClass('was-validated');
            return;
        }

        const formData = {
            firstName: $("#firstName").val(),
            lastName: $("#lastName").val(),
            email: $("#email").val(),
            password: $("#password").val(),
            dateOfBirth: $("#dateOfBirth").val()
        };

        // AJAX POST request for registration
        $.ajax({
            type: "POST",
            url: "/users/register",
            data: JSON.stringify(formData),
            contentType: "application/json",
            success: function(res) {
                if (res.success) {
                    $('#signUpModal').modal('hide');
                    alert("Registration successful! You can now log in.");
                    location.reload();
                } else {
                    $('#registerError').text(res.message).show();
                }
            },
            error: function(xhr) {
                // Show error message on failure
                $("#registerError").text(res.message).show();
            }
        });
    });
   
    // Logout handling
    $("#logoutBtn").on("click", function(event) {
        event.preventDefault(); // Prevent default link behavior

        // AJAX GET request for logout
        $.ajax({
            type: "GET",
            url: "/users/logout",
            success: function(res) {
                if (res.success) {
                    location.reload();
                } else {
                    alert("Logout failed. Please try again.");
                }
            },
            error: function() {
                alert("An error occurred during logout. Please try again.");
            }
        });
    });

    // Show forgot password modal from login modal
    $('#forgotPassword').on("click", function() {
        $('#loginModal').modal('hide');
        $('#forgotPasswordModal').modal('show');
    });

    // forgot password handling
    $("#forgotPasswordForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const $form = $(this);

        // Check form validity
        if (this.checkValidity() === false) {
            event.stopPropagation();
            $form.addClass('was-validated');
            return;
        }

        // Gather form data
        const email = $("#forgotEmail").val();

        // Send AJAX request to initiate password reset
        $.ajax({
            url: '/users/forgot-password',
            type: 'POST',
            data: JSON.stringify({ email }),
            contentType: 'application/json',
            success: function(res) {
                if (res.success) {
                    $('#forgotPasswordModal').modal('hide');
                    alert(res.message).show();
                    $form[0].reset();
                    $form.removeClass('was-validated');
                } else {
                    $('#forgotError').text(res.message).show();
                }
            },
            error: function(xhr) {
                // Handle errors
                $("#forgotError").text(xhr.responseText).show();
            }
        });
    });


});