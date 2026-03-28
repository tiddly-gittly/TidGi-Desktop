import { SvgIconTypeMap } from '@mui/material';
import { OverridableComponent } from '@mui/material/OverridableComponent';

import { PreferenceSections } from '@services/preferences/interface';

export type ISectionRecord<SectionTitleElement = HTMLSpanElement> = Record<
  PreferenceSections,
  {
    Icon: OverridableComponent<SvgIconTypeMap<unknown>>;
    hidden?: boolean;
    ref: React.RefObject<SectionTitleElement | null>;
    text: string;
  }
>;