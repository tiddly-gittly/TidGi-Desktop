import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Entity for a TiddlyWiki tiddler.
 */
@Entity('tiddlers')
export class WikiTiddler {
  @PrimaryColumn()
  title!: string;

  @Column({ type: 'text', nullable: true })
  text?: string;

  @Column({ type: 'text', nullable: true })
  type?: string;

  @Column({ type: 'integer', nullable: true })
  created?: number;

  @Column({ type: 'integer', nullable: true })
  modified?: number;

  @Column({ type: 'text', nullable: true })
  tags?: string;

  @Column({ type: 'text', nullable: true })
  fields?: string;

  @Column({ type: 'text', nullable: true })
  creator?: string;

  @Column({ type: 'text', nullable: true })
  modifier?: string;
}
