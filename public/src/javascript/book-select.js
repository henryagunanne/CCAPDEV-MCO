document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("flightSelectForm");
  
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
  
      const flightId = document.getElementById("flightSelect").value;
      if (!flightId) {
        alert("Please select a flight first.");
        return;
      }
  
      // Redirect to the actual booking page for that flight
      window.location.href = `/reservations/book/${flightId}`;
    });
  });
  