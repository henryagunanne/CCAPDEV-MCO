document.addEventListener('click', async event => {
  const acknowledgeButton = event.target.closest('.acknowledge-request');
  const decisionButton = event.target.closest('.complete-request');
  if (!acknowledgeButton && !decisionButton) return;

  const row = event.target.closest('[data-request-id]');
  const message = document.getElementById('privacyRequestMessage');
  const button = acknowledgeButton || decisionButton;
  button.disabled = true;
  const requestId = encodeURIComponent(row.dataset.requestId);
  const isAcknowledge = Boolean(acknowledgeButton);
  const payload = isAcknowledge
    ? {}
    : {
        outcome: decisionButton.dataset.outcome,
        decisionCode: row.querySelector('.decision-code').value.trim()
      };
  try {
    const response = await fetch(
      isAcknowledge
        ? `/privacy/dpo/requests/${requestId}/acknowledge`
        : `/privacy/dpo/requests/${requestId}/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
      message.textContent = result.message || 'Unable to update the privacy request.';
      button.disabled = false;
      return;
    }
    if (isAcknowledge) {
      row.querySelector('.request-status').textContent = 'ACKNOWLEDGED';
      acknowledgeButton.remove();
    } else {
      row.remove();
      message.textContent = `Request ${result.status.toLowerCase()}.`;
    }
  } catch {
    message.textContent = 'Unable to update the privacy request.';
    button.disabled = false;
  }
});
