import { ForwardedRef, forwardRef } from 'react';
import { SVGContainer } from './SVGContainer';

function CommandPaletteSVG(): React.JSX.Element {
  return (
    <svg width='22pt' height='22pt' viewBox='0 0 512 512' style={{ transform: 'rotate(225deg)' }} fill='currentColor'>
      <path
        d='M224 96l16-32 32-16-32-16-16-32-16 32-32 16 32 16 16 32zM80 160l26.66-53.33L160 80l-53.34-26.67L80 0 53.34 53.33 0 80l53.34 26.67L80 160zm0-96c8.84 0 16 7.16 16 16s-7.16 16-16 16-16-7.16-16-16 7.16-16 16-16zm352 224l-26.66 53.33L352 368l53.34 26.67L432 448l26.66-53.33L512 368l-53.34-26.67L432 288zm0 96c-8.84 0-16-7.16-16-16s7.16-16 16-16 16 7.16 16 16-7.16 16-16 16zm70.63-306.04L434.04 9.37C427.79 3.12 419.6 0 411.41 0s-16.38 3.12-22.63 9.37L9.37 388.79c-12.5 12.5-12.5 32.76 0 45.25l68.59 68.59c6.25 6.25 14.44 9.37 22.63 9.37s16.38-3.12 22.63-9.37l379.41-379.41c12.49-12.5 12.49-32.76 0-45.26zM100.59 480L32 411.41l258.38-258.4 68.6 68.6L100.59 480zm281.02-281.02l-68.6-68.6L411.38 32h.03L480 100.59l-98.39 98.39z'
        fillRule='evenodd'
      />
    </svg>
  );
}

export const CommandPaletteIcon = forwardRef((props, reference: ForwardedRef<HTMLDivElement>) => (
  <SVGContainer {...props} ref={reference}>
    <CommandPaletteSVG />
  </SVGContainer>
));
