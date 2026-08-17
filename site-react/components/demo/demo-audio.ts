// The VitePress original used Vue `ref()` as a module-level shared store.
// React reads the same store through `useSyncExternalStore`, so audio state
// still lives outside any single component and stays shared across demos.

const STORAGE_KEY = "svml-demo-audio-enabled";

type AudioState = {
  enabled: boolean;
  playbackEnabled: boolean;
};

let state: AudioState = { enabled: false, playbackEnabled: false };
const listeners = new Set<() => void>();
let initialized = false;

function emit(next: AudioState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeDemoAudio(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDemoAudioSnapshot() {
  return state;
}

// Server render has no localStorage or user activation; both flags start false.
export function getDemoAudioServerSnapshot(): AudioState {
  return { enabled: false, playbackEnabled: false };
}

function savePreference(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Audio still persists for the current page when storage is unavailable.
  }
}

export function initializeDemoAudio() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  let storedPreference = false;
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue === "true" || storedValue === "false") {
      storedPreference = storedValue === "true";
    }
  } catch {}

  emit({
    enabled: storedPreference,
    playbackEnabled: storedPreference && Boolean(navigator.userActivation?.hasBeenActive),
  });
}

export function enableDemoAudioAfterInteraction() {
  initializeDemoAudio();
  if (!state.enabled || state.playbackEnabled) return false;

  emit({ ...state, playbackEnabled: true });
  return true;
}

export function toggleDemoAudio() {
  initializeDemoAudio();
  const nextValue = !state.enabled;
  emit({ enabled: nextValue, playbackEnabled: nextValue });
  savePreference(nextValue);
  return nextValue;
}
