interface IPointerIntentRect {
  height: number;
  top: number;
}

interface IGetPointerYForIntentOptions {
  activatorPointerY?: number;
  capturedPointerY?: number;
  rect: IPointerIntentRect;
}

/**
 * Prefer the capture-phase pointer position when it is consistent with the
 * current collision target. A renderer remount or a missed pointer event can
 * leave the captured value at the source item's position; in that case the
 * activator-plus-delta value is a safer representation of the current pointer.
 */
export function getPointerYForIntent({
  activatorPointerY,
  capturedPointerY,
  rect,
}: IGetPointerYForIntentOptions): number {
  const rectBottom = rect.top + rect.height;
  const capturedPointerIsOverTarget = capturedPointerY !== undefined &&
    capturedPointerY >= rect.top &&
    capturedPointerY <= rectBottom;

  if (capturedPointerIsOverTarget) {
    return capturedPointerY;
  }

  return activatorPointerY ?? capturedPointerY ?? (rect.top + rect.height / 2);
}
