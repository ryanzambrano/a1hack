// No-op stub for the platform demo. Customer chat only mounts for campaign
// assignments (chat.js returns early when source !== "campaign"); platform
// orders are source "manual", so mountChatPanel is never called. The export
// exists only so the static import resolves. Not dashboard code.
export function mountChatPanel() {}
