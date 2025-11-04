jQuery(function (){
    // handle edit profile form submission
    $("#editProfileForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const $form = $(this);

        // Check form validity
        if (this.checkValidity() === false) {
            event.stopPropagation();
            $form.addClass('was-validated');
            return;
        }

        // Gather form data
        const userId = $form.data("user-id");
        const formData = {
            firstName: $("#firstName").val(),
            lastName: $("#lastName").val(),
            email: $("#email").val(),
            dateOfBirth: $("#dateOfBirth").val()
        };

        // Send AJAX request to update profile
        $.ajax({
            url: `/users/edit/${userId}`,
            type: 'POST',
            data: JSON.stringify(formData),
            contentType: 'application/json',
            success: function(res) {
                if (res.success) {
                    $('#editProfileModal').modal('hide');
                    alert("Profile updated successfully!");
                    location.reload();
                } else {
                    $('#editError').text(res.message).show();
                }
            },
            error: function(xhr) {
                // Handle errors
                $("#editError").text(xhr.responseText).show();
            }
        });
    });
    
    // handle confirm password match on new password input
    $("#confirmNewPassword").on("input", function() {
        const newPassword = $("#newPassword").val();
        const confirmNewPassword = $(this).val();

        if (confirmNewPassword === "") {
            $(".confirmNewPassword .invalid-feedback").text("Please confirm your password");
        } else if (newPassword !== confirmNewPassword) {
            $(".confirmNewPassword .invalid-feedback").text("Passwords do not match");
        } else {
            $(".confirmNewPassword .invalid-feedback").text(""); // Clear feedback if passwords match
        }
    });

    // ensure that current password and new passwords are not the same
    $("#newPassword").on("input", function() {
        const currentPassword = $("#currentPassword").val();
        const newPassword = $(this).val();

        if (newPassword === "") {
            $(".newPassword .invalid-feedback").text("Please enter a new password");
        } else if (newPassword === currentPassword) {
            $(".newPassword .invalid-feedback").text("New password must be different from current password");
        } else {
            $(".newPassword .invalid-feedback").text(""); // Clear feedback if valid
        }
    });

    // handle change password form submission
    $("#changePasswordForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const $form = $(this);

        // Check form validity
        if (this.checkValidity() === false) {
            event.stopPropagation();
            $form.addClass('was-validated');
            return;
        }

        // Gather form data
        const userId = $form.data("user-id");
        const formData = {
            currentPassword: $("#currentPassword").val(),
            newPassword: $("#newPassword").val(),
        };

        // Send AJAX request to change password
        $.ajax({
            url: `/users/change-password/${userId}`,
            type: 'POST',
            data: JSON.stringify(formData),
            contentType: 'application/json',
            success: function(res) {
                if (res.success) {
                    $('#changePasswordModal').modal('hide');
                    alert("Password changed successfully!");
                    $form[0].reset();
                    $form.removeClass('was-validated');
                    location.reload();
                } else {
                    $('#passwordError').text(res.message).show();
                }
            },
            error: function(xhr) {
                // Handle errors
                $("#passwordError").text(xhr.responseText).show();
            }
        });
    });

    // handle delete account form submission
    $("#deleteAccountForm").on("submit", function(event) {
        event.preventDefault(); // Prevent default form submission

        const userId = $(this).data("user-id");

        // Send AJAX request to delete account
        $.ajax({
            url: `/users/delete/${userId}`,
            type: 'POST',
            success: function(res) {
                if (res.success) {
                    $('#deleteAccountModal').modal('hide');
                    alert("Account deleted successfully.");
                    window.location.href = "/"; // Redirect to homepage
                } else {
                    alert("Error deleting account: " + res.message);
                }
            },
            error: function(xhr) {
                // Handle errors
                alert("Error deleting account: " + xhr.responseText);
            }
        });
    });

    // logout handling
    $("#logoutBtn").on("click", function(event) {
        event.preventDefault(); // Prevent default link behavior

        // Send AJAX request to logout
        $.ajax({
            url: '/users/logout',
            type: 'POST',
            success: function() {
                alert("Logged out successfully.");
                window.location.href = "/"; // Redirect to homepage
            },
            error: function(xhr) {
                // Handle errors
                alert("Error logging out: " + xhr.responseText);
            }
        });
    });

});