import { describe, expect, it } from 'vitest';
import { flattenPrompts } from '../promptConcat';
import { IPrompt } from '../promptConcatSchema';

describe('flattenPrompts', () => {
  it('should flatten prompts without roles', () => {
    const prompts: IPrompt[] = [
      {
        id: 'parent',
        caption: 'Parent Prompt',
        text: 'Parent text ',
        children: [
          { id: 'child1', caption: 'Child 1', text: 'Child 1 text ' },
          { id: 'child2', caption: 'Child 2', text: 'Child 2 text ' },
        ],
      },
    ];

    const result = flattenPrompts(prompts);
    expect(result).toEqual([
      {
        role: 'system',
        content: 'Parent text Child 1 text Child 2 text',
      },
    ]);
  });

  it('should treat children with roles as separate messages', () => {
    const prompts: IPrompt[] = [
      {
        id: 'parent',
        text: 'Parent text ',
        caption: 'Parent Prompt',
        role: 'system',
        children: [
          { id: 'child1', caption: 'Child 1', text: 'Child 1 text ' }, // No role, should be merged with parent
          { 
            id: 'child2', 
            caption: 'Child 2',
            text: 'Child 2 text ', 
            role: 'user'  // Has role, should be separate
          },
          { 
            id: 'child3', 
            caption: 'Child 3',
            text: 'Child 3 text ', 
            role: 'assistant'  // Has role, should be separate
          },
        ],
      },
    ];

    const result = flattenPrompts(prompts);
    expect(result).toEqual([
      {
        role: 'system',
        content: 'Parent text Child 1 text',
      },
      {
        role: 'user',
        content: 'Child 2 text',
      },
      {
        role: 'assistant',
        content: 'Child 3 text',
      },
    ]);
  });

  it('should handle nested children with mixed roles properly', () => {
    const prompts: IPrompt[] = [
      {
        id: 'parent',
        caption: 'System Prompt',
        role: 'system',
        text: 'System instruction: ',
        children: [
          {
            id: 'history',
            caption: 'Chat History',
            text: 'Chat history: ',
            children: [
              { id: 'msg1', caption: 'User Message 1', role: 'user', text: 'Hello' },
              { id: 'msg2', caption: 'Assistant Message 1', role: 'assistant', text: 'Hi there' },
              { 
                id: 'msg3', 
                caption: 'User Message 2',
                role: 'user', 
                text: 'How are you?',
                children: [
                  { id: 'attachment', caption: 'Attachment', text: ' [with attachment]' } // Should be merged with parent
                ]
              },
            ]
          },
        ],
      },
    ];

    const result = flattenPrompts(prompts);
    expect(result).toEqual([
      {
        role: 'system',
        content: 'System instruction: Chat history:',
      },
      {
        role: 'user',
        content: 'Hello',
      },
      {
        role: 'assistant',
        content: 'Hi there',
      },
      {
        role: 'user',
        content: 'How are you? [with attachment]',
      },
    ]);
  });
});
