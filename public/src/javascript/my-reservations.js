jQuery(function () {
  // ==== MY RESERVATIONS PAGE JS (myBooking.hbs)=====
  $(document).on('click', '.cancelReservation', function() {
    const id = $(this).data('id');

    if (!confirm("Are you sure you want to cancel this reservation?")) return;

    $.ajax({
      url: `/reservations/cancel/${id}`,
      method: 'POST',
      dataType: 'json',
      success: function (res) {
        if (res.success){
          const main = $(`#reservation-${id}`);
          const passengers = $(`#passengers-${id}`);
          if (main) main.remove();
          if (passengers) passengers.remove();
          showToast("Reservation Cancelled.", true);
        }else {
          showToast("Failed to cancel reservation.", false);
        }
      },
      error: function(err) {
        console.log('AJAX error:', err)
        showToast("An error occured", false);
      }
    });
  });
});