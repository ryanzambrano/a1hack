// No-op stub for the platform demo. uploadViaSign is only used by the chat
// attachment path, which never mounts for manual orders. Order photos upload
// as inline base64 to /photo instead (see the adapter). Not dashboard code.
export async function uploadViaSign() {
  throw new Error("Blob uploads are disabled in the platform demo");
}
