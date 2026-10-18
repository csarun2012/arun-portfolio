(() => {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const token = parameters.get('token') || '';
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  Object.defineProperty(window, '__resumeAccessToken', {
    value: token,
    writable: true,
    configurable: true,
  });
})();

