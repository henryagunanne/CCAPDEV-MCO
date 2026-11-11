(function () {

  /** * Retrieve the CSRF token from the meta tag in the document.
   * @returns {string} The CSRF token, or an empty string if not found.
   */
  function token() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  if (window.jQuery) {
    window.jQuery.ajaxPrefilter((options, originalOptions, jqXHR) => {
      const method = String(options.type || options.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        jqXHR.setRequestHeader('X-CSRF-Token', token());
      }
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const request = new Request(input, init);
    const method = request.method.toUpperCase();
    const sameOrigin = new URL(request.url, window.location.href).origin === window.location.origin;
    if (sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(request.headers);
      headers.set('X-CSRF-Token', token());
      return originalFetch(new Request(request, { headers }));
    }
    return originalFetch(request);
  };

  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="reload"]')) window.location.reload();
  });
})();
