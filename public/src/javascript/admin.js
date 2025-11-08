
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

  //
});