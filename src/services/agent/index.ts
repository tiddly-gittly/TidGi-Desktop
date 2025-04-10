/* eslint-disable @typescript-eslint/require-await */
import { injectable } from 'inversify';
import { cloneDeep, debounce, mergeWith } from 'lodash';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import type { IAgentService,  } from './interface';

@injectable()
export class AgentService implements IAgentService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

}
