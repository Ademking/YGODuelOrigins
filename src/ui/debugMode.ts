// Session-scoped opt-in for the debug tools and duel FPS display.
let enabled = false;
export const debugModeEnabled = () => enabled;
export const toggleDebugMode = () => (enabled = !enabled);
