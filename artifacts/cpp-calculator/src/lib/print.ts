/**
 * Print the current page with a specific document title.
 *
 * Browsers use `document.title` as the default filename when the user chooses
 * "Save as PDF" in the print dialog, so setting it to the client's scenario
 * name gives the saved file a meaningful name (e.g. "CPP Estimate - Jane Doe").
 *
 * The previous title is restored after printing. `window.print()` blocks in
 * Chromium/Firefox; the `afterprint` listener covers browsers where it does
 * not (e.g. Safari), and the timeout is a last-resort restore.
 */
export function printWithTitle(title: string): void {
  const prev = document.title;
  const safe = title.trim().replace(/[\\/:*?"<>|]/g, "-");
  document.title = safe ? `CPP Estimate - ${safe}` : prev;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);

  try {
    window.print();
  } finally {
    // In blocking browsers this runs after the dialog closes; elsewhere the
    // afterprint listener restores first and this is a no-op.
    setTimeout(restore, 1000);
  }
}
