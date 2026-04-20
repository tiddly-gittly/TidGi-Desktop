import { OverridableComponent } from '@mui/material/OverridableComponent';
import type { SvgIconTypeMap } from '@mui/material/SvgIcon';
import type { RefObject } from 'react';

export type ISectionRecord<SectionTitleElement = HTMLSpanElement> = Record<
  string,
  {
    Icon: OverridableComponent<SvgIconTypeMap<unknown>>;
    hidden?: boolean;
    ref: RefObject<SectionTitleElement | null>;
    text: string;
  }
>;
