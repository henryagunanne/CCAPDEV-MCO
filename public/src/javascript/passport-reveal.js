document.addEventListener('click', async event => {
  const button = event.target.closest('.passport-reveal-button');
  if (!button) return;

  const card = button.closest('.p-2');
  const reason = card.querySelector('.passport-reveal-reason');
  const confirmed = card.querySelector('.passport-reveal-confirm');
  const output = card.querySelector('.passport-reveal-output');
  if (!reason.reportValidity() || !confirmed.reportValidity()) return;

  button.disabled = true;
  output.textContent = '';
  try {
    const response = await fetch('/privacy/passports/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: button.dataset.reservationId,
        passengerId: button.dataset.passengerId,
        reason: reason.value,
        confirmed: confirmed.checked
      })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      output.textContent = result.message || 'Passport reveal was not authorized.';
      return;
    }

    output.textContent = result.passport;
    reason.value = '';
    confirmed.checked = false;
    window.setTimeout(() => {
      if (output.textContent === result.passport) output.textContent = '';
    }, 30000);
  } catch {
    output.textContent = 'Unable to reveal passport data.';
  } finally {
    button.disabled = false;
  }
});
