jQuery(function (){
  $('#searchFlightForm').on('submit', function (e) {
    e.preventDefault();

    const query = document.getElementById('searchFlightInput').value.trim();
    if (!query) return;
  
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = 'block';
    const results = document.getElementById('flightResults');
  
    try {
      const res = await fetch(`/admin/flights/${query}`);
      const data = await res.json();
      spinner.style.display = 'none';
  
      if (res.ok) {
        results.innerHTML = `
          <div class="card mx-auto mt-4 shadow-sm" style="max-width: 600px; border-radius:12px;">
            <div class="card-body text-start">
              <h5 class="card-title">Flight ${data.flightNumber}</h5>
              <p><strong>From:</strong> ${data.origin} → <strong>To:</strong> ${data.destination}</p>
              <p><strong>Date:</strong> ${new Date(data.date).toLocaleDateString()}</p>
              <p><strong>Price:</strong> ₱${data.price}</p>
            </div>
          </div>
        `;
      } else {
        results.innerHTML = `<p class="text-danger mt-3">${data.message}</p>`;
      }
    } catch (err) {
      spinner.style.display = 'none';
      results.innerHTML = `<p class="text-danger mt-3">Error fetching flight data.</p>`;
    }
  });
});