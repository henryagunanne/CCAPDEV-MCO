jQuery(function (){
  // logout handling
  $("#adminLogout").on("click", function(event) {
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