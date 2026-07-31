// No-op stub for the platform demo. The vendored assignment detail imports
// renderPdfPreviews to rasterize design PDFs into thumbnails - a Daymaker
// infra feature. Platform orders carry no design PDFs, so this never has work
// to do; the stub keeps the ES module graph intact. Not dashboard code.
export function renderPdfPreviews() {}
