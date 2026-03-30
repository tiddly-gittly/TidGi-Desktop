import { OverridableComponent } from '@mui/material/OverridableComponent';
import type { SvgIconTypeMap } from '@mui/material/SvgIcon';
import type { RefObject } from 'react';

import { PreferenceSections } from '@services/preferences/interface';

export type ISectionRecord<SectionTitleElement = HTMLSpanElement> = Record<
  PreferenceSections,
  {
    Icon: OverridableComponent<SvgIconTypeMap<unknown>>;
    hidden?: boolean;
    ref: RefObject<SectionTitleElement | null>;
    text: string;
  }
>;
