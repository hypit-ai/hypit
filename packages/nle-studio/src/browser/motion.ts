export const softEase = [.4, 0, .2, 1] as const;

export function enterMotion(reduced?: boolean | null) {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 0 },
    transition: { duration: reduced ? 0 : .2, ease: softEase },
  };
}

export function fadeMotion(reduced?: boolean | null) {
  return {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
    transition: { duration: reduced ? 0 : .15, ease: softEase },
  };
}

export function expandMotion(reduced?: boolean | null) {
  return {
    initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 },
    transition: { duration: reduced ? 0 : .2, ease: softEase },
  };
}
