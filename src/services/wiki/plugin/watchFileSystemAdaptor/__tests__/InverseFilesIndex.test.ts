import { describe, expect, it } from 'vitest';
import { type IBootFilesIndexItemWithTitle, InverseFilesIndex } from '../InverseFilesIndex';

describe('InverseFilesIndex', () => {
  describe('Basic Operations', () => {
    it('should initialize with empty index', () => {
      const index = new InverseFilesIndex();
      expect(index.size).toBe(0);
    });

    it('should set and get file descriptor', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'TestTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set('test/path.tid', fileDescriptor);

      expect(index.size).toBe(1);
      expect(index.get('test/path.tid')).toEqual(fileDescriptor);
    });

    it('should return undefined for non-existent path', () => {
      const index = new InverseFilesIndex();
      expect(index.get('non-existent')).toBeUndefined();
    });

    it('should check if path exists', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'TestTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      expect(index.has('test/path.tid')).toBe(false);

      index.set('test/path.tid', fileDescriptor);

      expect(index.has('test/path.tid')).toBe(true);
    });

    it('should delete file descriptor', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'TestTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set('test/path.tid', fileDescriptor);
      expect(index.has('test/path.tid')).toBe(true);

      const deleted = index.delete('test/path.tid');

      expect(deleted).toBe(true);
      expect(index.has('test/path.tid')).toBe(false);
      expect(index.size).toBe(0);
    });

    it('should return false when deleting non-existent path', () => {
      const index = new InverseFilesIndex();
      const deleted = index.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should update existing file descriptor', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor1: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'TestTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      const fileDescriptor2: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'UpdatedTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: true,
      };

      index.set('test/path.tid', fileDescriptor1);
      expect(index.get('test/path.tid')?.tiddlerTitle).toBe('TestTiddler');

      index.set('test/path.tid', fileDescriptor2);
      expect(index.get('test/path.tid')?.tiddlerTitle).toBe('UpdatedTiddler');
      expect(index.size).toBe(1); // Size should remain 1
    });
  });

  describe('getTitleByPath', () => {
    it('should get tiddler title by file path', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: 'test/path.tid',
        tiddlerTitle: 'TestTiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set('test/path.tid', fileDescriptor);

      expect(index.getTitleByPath('test/path.tid')).toBe('TestTiddler');
    });

    it('should throw error when path does not exist', () => {
      const index = new InverseFilesIndex();

      expect(() => {
        index.getTitleByPath('non-existent');
      }).toThrow('non-existent\n↑ not existed in InverseFilesIndex');
    });
  });

  describe('Bulk Operations', () => {
    it('should clear all entries', () => {
      const index = new InverseFilesIndex();

      index.set('path1.tid', {
        filepath: 'path1.tid',
        tiddlerTitle: 'Tiddler1',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      index.set('path2.tid', {
        filepath: 'path2.tid',
        tiddlerTitle: 'Tiddler2',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      });

      expect(index.size).toBe(2);

      index.clear();

      expect(index.size).toBe(0);
      expect(index.has('path1.tid')).toBe(false);
      expect(index.has('path2.tid')).toBe(false);
    });

    it('should handle multiple file descriptors', () => {
      const index = new InverseFilesIndex();
      const descriptors: Array<[string, IBootFilesIndexItemWithTitle]> = [
        ['path1.tid', { filepath: 'path1.tid', tiddlerTitle: 'Tiddler1', type: 'application/x-tiddler', hasMetaFile: false }],
        ['path2.tid', { filepath: 'path2.tid', tiddlerTitle: 'Tiddler2', type: 'application/x-tiddler', hasMetaFile: false }],
        ['path3.tid', { filepath: 'path3.tid', tiddlerTitle: 'Tiddler3', type: 'application/x-tiddler', hasMetaFile: false }],
      ];

      for (const [path, descriptor] of descriptors) {
        index.set(path, descriptor);
      }

      expect(index.size).toBe(3);
      expect(index.getTitleByPath('path1.tid')).toBe('Tiddler1');
      expect(index.getTitleByPath('path2.tid')).toBe('Tiddler2');
      expect(index.getTitleByPath('path3.tid')).toBe('Tiddler3');
    });
  });

  describe('Iteration', () => {
    it('should iterate over entries', () => {
      const index = new InverseFilesIndex();
      const descriptors = new Map<string, IBootFilesIndexItemWithTitle>([
        ['path1.tid', { filepath: 'path1.tid', tiddlerTitle: 'Tiddler1', type: 'application/x-tiddler', hasMetaFile: false }],
        ['path2.tid', { filepath: 'path2.tid', tiddlerTitle: 'Tiddler2', type: 'application/x-tiddler', hasMetaFile: false }],
      ]);

      for (const [path, descriptor] of descriptors) {
        index.set(path, descriptor);
      }

      const entries = Array.from(index.entries());

      expect(entries).toHaveLength(2);
      expect(entries[0][0]).toBe('path1.tid');
      expect(entries[0][1].tiddlerTitle).toBe('Tiddler1');
      expect(entries[1][0]).toBe('path2.tid');
      expect(entries[1][1].tiddlerTitle).toBe('Tiddler2');
    });

    it('should iterate over keys', () => {
      const index = new InverseFilesIndex();

      index.set('path1.tid', { filepath: 'path1.tid', tiddlerTitle: 'Tiddler1', type: 'application/x-tiddler', hasMetaFile: false });
      index.set('path2.tid', { filepath: 'path2.tid', tiddlerTitle: 'Tiddler2', type: 'application/x-tiddler', hasMetaFile: false });

      const keys = Array.from(index.keys());

      expect(keys).toEqual(['path1.tid', 'path2.tid']);
    });

    it('should iterate over values', () => {
      const index = new InverseFilesIndex();

      index.set('path1.tid', { filepath: 'path1.tid', tiddlerTitle: 'Tiddler1', type: 'application/x-tiddler', hasMetaFile: false });
      index.set('path2.tid', { filepath: 'path2.tid', tiddlerTitle: 'Tiddler2', type: 'application/x-tiddler', hasMetaFile: false });

      const values = Array.from(index.values());

      expect(values).toHaveLength(2);
      expect(values[0].tiddlerTitle).toBe('Tiddler1');
      expect(values[1].tiddlerTitle).toBe('Tiddler2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in file paths', () => {
      const index = new InverseFilesIndex();
      const specialPath = 'test/path with spaces/file-name.tid';
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: specialPath,
        tiddlerTitle: 'Special Tiddler',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set(specialPath, fileDescriptor);

      expect(index.has(specialPath)).toBe(true);
      expect(index.getTitleByPath(specialPath)).toBe('Special Tiddler');
    });

    it('should handle unicode characters in tiddler titles', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: 'test/unicode.tid',
        tiddlerTitle: '测试条目 🎉',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set('test/unicode.tid', fileDescriptor);

      expect(index.getTitleByPath('test/unicode.tid')).toBe('测试条目 🎉');
    });

    it('should handle empty string as file path', () => {
      const index = new InverseFilesIndex();
      const fileDescriptor: IBootFilesIndexItemWithTitle = {
        filepath: '',
        tiddlerTitle: 'EmptyPath',
        type: 'application/x-tiddler',
        hasMetaFile: false,
      };

      index.set('', fileDescriptor);

      expect(index.has('')).toBe(true);
      expect(index.getTitleByPath('')).toBe('EmptyPath');
    });
  });

  describe('Performance', () => {
    it('should handle large number of entries efficiently', () => {
      const index = new InverseFilesIndex();
      const count = 1000;

      // Add entries
      for (let i = 0; i < count; i++) {
        index.set(`path${i}.tid`, {
          filepath: `path${i}.tid`,
          tiddlerTitle: `Tiddler${i}`,
          type: 'application/x-tiddler',
          hasMetaFile: false,
        });
      }

      expect(index.size).toBe(count);

      // Random access should be fast (O(1))
      expect(index.has('path500.tid')).toBe(true);
      expect(index.getTitleByPath('path500.tid')).toBe('Tiddler500');

      // Delete operations should be fast
      index.delete('path500.tid');
      expect(index.has('path500.tid')).toBe(false);
      expect(index.size).toBe(count - 1);
    });
  });
});
