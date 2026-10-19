(() => {
  // Served only by the development gateway; production HTML stays untouched.
  let version;
  const events = new EventSource('/__dev/events');
  events.addEventListener('version', (event) => {
    const next = JSON.parse(event.data);
    if (version && version !== next.version) {
      if (next.stylesOnly) {
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          const href = new URL(link.href);
          if (href.origin !== window.location.origin) return;
          href.searchParams.set('__dev', next.version);
          link.href = href.href;
        });
      } else window.location.reload();
    }
    version = next.version;
  });
})();
