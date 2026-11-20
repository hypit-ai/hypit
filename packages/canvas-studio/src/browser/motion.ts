/**
 * Motion shared across the app, all on the soft curve (cubic-bezier(.4,0,.2,1)):
 * - enter: anything that appears inside a page, the page itself included, fades in while rising 4px over 200ms and
 *   fades out over the same time. CSS uses `var(--enter)` from `motion.css` for the same motion.
 * - fade: small overlays and indicators (drag labels, badges, hover toolbars) fade in and out over 150ms.
 * - expand: sections that open in place grow from no height while fading in over 200ms.
 * - popup: menus and pickers grow from half size and fade in over 200ms; panels opened from a toolbar grow from 80%.
 *   Both shrink back the same way, out of the control that opened them.
 * Dialogs use their own 400ms curve in `components/common.tsx`. With reduced motion, positions and sizes do not
 * animate (MotionConfig in `main.tsx`), and passing `reduced` also drops the fade.
 */
export const softEase = [.4, 0, .2, 1] as const;

export function enterMotion(reduced?: boolean | null) {
  return { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 0 }, transition: { duration: reduced ? 0 : .2, ease: softEase } };
}

export function fadeMotion(reduced?: boolean | null) {
  return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduced ? 0 : .15, ease: softEase } };
}

export function expandMotion(reduced?: boolean | null) {
  return { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, transition: { duration: reduced ? 0 : .2, ease: softEase } };
}

export function popupMotion(reduced: boolean | null, scaleFrom = .5) {
  const hidden = { opacity: 0, scale: reduced ? 1 : scaleFrom };
  return { initial: hidden, animate: { opacity: 1, scale: 1 }, exit: hidden, transition: { duration: reduced ? 0 : .2, ease: softEase } };
}
