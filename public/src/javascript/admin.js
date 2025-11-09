
jQuery (function() {

  // Flight search form submission handling
  $('#searchFlightForm').on('submit', function (e) {
    e.preventDefault();
    const query = $('#searchFlightInput').val().trim();

    if (!query) return;
  
    const $spinner = $('#loadingSpinner');
    const $results = $('#flightResults'); 

    $results.empty();
    $spinner.show();

    $.ajax ({
      url: `/admin/flights/${query}`,
      method: 'GET',
      dataType: 'json',
      success: function(data) {
        $spinner.hide();
        if (data.success) {
          $results.html(`
          <div class="card mx-auto mt-4 shadow-sm" style="max-width: 600px; border-radius:12px;">
            <div class="card-body text-start">
              <h5 class="card-title">Flight ${data.flightNumber}</h5>
              <p><strong>From:</strong> ${data.origin} → <strong>To:</strong> ${data.destination}</p>
              <p><strong>Date:</strong> ${new Date(data.date).toLocaleDateString()}</p>
              <p><strong>Price:</strong> ₱${data.price}</p>
            </div>
          </div>
        `);
        }else {
          $results.html(`<p class="text-danger mt-3">${data.message}</p>`);
        }

      },
      error: function(xhr) {
        $spinner.hide();
        const errorMsg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'An error occurred while searching for the flight.';
        $results.html(`<p class="text-danger mt-3">${errorMsg}</p>`);
      }
    });
  });

  // FLIGHT LIST PAGE JS
  /* ======== Toast helper (jQuery) ======== */
  function showToast(message, success = true) {
    const $toast = $('#toast');
    $toast
      .removeClass('bg-success bg-danger')
      .addClass(success ? 'bg-success' : 'bg-danger');

    $('#toastBody').text(message);
    new bootstrap.Toast($toast[0]).show();
  }

  /* ======== Delete flight ======== */
  function deleteFlight(id) {
    if (!confirm('Are you sure you want to delete this flight?')) return;

    $.ajax({
      url: `/admin/delete/${id}`,
      type: 'DELETE',
      dataType: 'json',
      success: function (data) {
        $(`#flight-${id}`).remove();
        showToast(data.message || 'Flight deleted successfully', true);
      },
      error: function (xhr) {
        let msg = 'Failed to delete flight';
        if (xhr.responseJSON && xhr.responseJSON.message) {
          msg = xhr.responseJSON.message;
        }
        showToast(msg, false);
      }
    });
  }

  /* ======== Search filter ======== */
  $('#flightFilter').on('keyup', function () {
    const query = $(this).val().toLowerCase();
    $('#flightTable tr').each(function () {
      const text = $(this).text().toLowerCase();
      $(this).toggle(text.includes(query));
    });
  });

  /* ======== Column sort ======== */
  $('th').on('click', function () {
    const index = $(this).index();
    const rows = $('#flightTable tr').get();

    rows.sort(function (a, b) {
      const aText = $(a).children().eq(index).text().toLowerCase();
      const bText = $(b).children().eq(index).text().toLowerCase();
      return aText.localeCompare(bText, undefined, { numeric: true });
    });

    $('#flightTable').append(rows);
  });

  // create.hbs JS
  // Clone all origin options into destination
  $('#destination').html($('#origin').html());

  // When the origin changes
  $('#origin').on('change', function() {
    const selectedOrigin = $(this).val();

    // Reset destination to full list
    $('#destination').html($('#origin').html());

    // Disable the same city in destination
    if (selectedOrigin) {
      $('#destination option').each(function() {
        if ($(this).val() === selectedOrigin) {
          $(this).attr('disabled', true).text($(this).text() + ' (Unavailable)');
        }
      });
    }
  });

  /* Handle flight creation */
  $('#createFlightForm').on('submit', function(e) {
    e.preventDefault(); // Prevent default form submission
    const $form = $(this);
    
    // Check form validity
    if (this.checkValidity() === false) {
      e.stopPropagation();
      $form.addClass('was-validated');
      return;
    }

    // Gather form data
    const formData = {
      flightNumber: $('#flightNumber').val(),
      origin: $('#origin').val(),
      destination: $('#destination').val(),
      departureDate: $('#departureDate').val(),
      departureTime: $('#departureTime').val(),
      arrivalTime: $('#arrivalTime').val(),
      aircraft: $('#aircraft').val(),
      price: parseFloat($('#price').val()),
      seatCapacity: parseInt($('#seatCapacity').val(), 10),
      status: $('#status').val()
    }
    
    $.ajax({
      url: '/admin/create',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(formData),
      success: function(res) {
        showToast(res.message || 'Flight created successfully!', true);
        $form[0].reset();
        $form.removeClass('was-validated');
        setTimeout(() => window.location.href = '/admin/flights', 1500);
      },
      error: function(xhr) {
        let msg = 'Error connecting to server.';
        if (xhr.responseJSON && xhr.responseJSON.message) {
          msg = xhr.responseJSON.message;
        }
        showToast(msg, false);
      }
    });
  });

  // handle logout
  $('.logoutButton').on('click', function() {
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