import { ref } from "vue";

const STORAGE_KEY = "svml-demo-audio-enabled";

export const demoAudioEnabled = ref(false);
export const demoAudioPlaybackEnabled = ref(false);

let initialized = false;

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

  demoAudioEnabled.value = storedPreference;
  demoAudioPlaybackEnabled.value = storedPreference && Boolean(navigator.userActivation?.hasBeenActive);
}

export function enableDemoAudioAfterInteraction() {
  initializeDemoAudio();
  if (!demoAudioEnabled.value || demoAudioPlaybackEnabled.value) return false;

  demoAudioPlaybackEnabled.value = true;
  return true;
}

export function toggleDemoAudio() {
  initializeDemoAudio();
  const nextValue = !demoAudioEnabled.value;
  demoAudioEnabled.value = nextValue;
  demoAudioPlaybackEnabled.value = nextValue;
  savePreference(nextValue);
  return nextValue;
}
