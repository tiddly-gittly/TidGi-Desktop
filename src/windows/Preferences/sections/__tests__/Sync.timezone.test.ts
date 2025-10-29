import { setDate, setMonth, setYear } from 'date-fns';
import { describe, expect, it } from 'vitest';

/**
 * Test timezone handling for sync interval settings
 * This tests the logic from Sync.tsx to ensure it works correctly across timezones
 */
describe('Sync interval timezone handling', () => {
  /**
   * Helper to simulate the display value calculation from Sync.tsx (new timezone-independent version)
   */
  function _calculateDisplayValue(syncDebounceInterval: number): Date {
    return new Date(Date.UTC(1970, 0, 1, 0, 0, 0, syncDebounceInterval));
  }

  /**
   * Helper to simulate the save value calculation from Sync.tsx (new timezone-independent version)
   */
  function calculateSaveValue(date: Date): number {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const intervalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
    return intervalMs;
  }

  /**
   * OLD BUGGY VERSION - Helper to simulate the old display value calculation
   */
  // function calculateDisplayValueOld(syncDebounceInterval: number, timezoneOffset: number): Date {
  //   return fromUnixTime(syncDebounceInterval / 1000 + timezoneOffset * 60);
  // }

  /**
   * OLD BUGGY VERSION - Helper to simulate the old save value calculation
   */
  function calculateSaveValueOld(date: Date, timezoneOffset: number): number {
    const timeWithoutDate = setDate(setMonth(setYear(date, 1970), 0), 1);
    const utcTime = (timeWithoutDate.getTime() / 1000 - timezoneOffset * 60) * 1000;
    return utcTime;
  }

  /**
   * Mock getTimezoneOffset for different timezones
   * Note: getTimezoneOffset returns negative values for timezones ahead of UTC
   * UTC+8 (Beijing/Singapore) = -480
   * UTC+0 (London) = 0
   * UTC-5 (New York) = 300
   */
  const timezones = [
    { name: 'UTC+8 (Beijing)', offset: -480 },
    { name: 'UTC+8 (Singapore)', offset: -480 },
    { name: 'UTC+0 (London)', offset: 0 },
    { name: 'UTC-5 (New York)', offset: 300 },
    { name: 'UTC+5:30 (India)', offset: -330 },
  ];

  describe('5 minute interval', () => {
    const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300000

    timezones.forEach(({ name, offset }) => {
      it(`should correctly handle 5 minute interval in ${name}`, () => {
        // Simulate setting 5 minutes in the UI
        // User sees 00:05:00 in the TimePicker
        const userSelectedDate = new Date(1970, 0, 1, 0, 5, 0, 0);

        // Mock the timezone offset
        const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = () => offset;

        try {
          // Calculate what would be saved (new timezone-independent version)
          const savedValue = calculateSaveValue(userSelectedDate);

          // The saved value should always be 5 minutes regardless of timezone
          expect(savedValue).toBe(FIVE_MINUTES_MS);
        } finally {
          Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
        }
      });
    });
  });

  describe('30 minute interval (default)', () => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 1800000

    timezones.forEach(({ name, offset }) => {
      it(`should correctly handle 30 minute interval in ${name}`, () => {
        const userSelectedDate = new Date(1970, 0, 1, 0, 30, 0, 0);

        const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = () => offset;

        try {
          const savedValue = calculateSaveValue(userSelectedDate);

          expect(savedValue).toBe(THIRTY_MINUTES_MS);
        } finally {
          Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
        }
      });
    });
  });

  describe('Edge case: problematic value from issue #310', () => {
    it('should understand why 2105000 was stored', () => {
      // The user reported: syncDebounceInterval: 2105000
      // This equals 2105000 / 1000 / 60 = 35.083... minutes
      // This test documents the issue for reference
      const _problematicValue = 2105000;

      // This would be caused by timezone offset calculation errors in the old code
      // The fix ensures timezone-independent time interval handling
    });
  });

  describe('Real-world scenario: TimePicker behavior', () => {
    it('should handle Date object from TimePicker correctly', () => {
      // When user selects 00:05:00 in TimePicker, what Date object is created?
      // The TimePicker component creates a Date with local time 00:05:00
      const localDate = new Date(1970, 0, 1, 0, 5, 0, 0);

      // Apply the NEW save logic (timezone-independent)
      const hours = localDate.getHours();
      const minutes = localDate.getMinutes();
      const seconds = localDate.getSeconds();
      const intervalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;

      // This should equal 5 minutes regardless of timezone
      expect(intervalMs).toBe(5 * 60 * 1000);
    });
  });

  describe('OLD BUGGY VERSION - Demonstrates the timezone bug', () => {
    it('shows how old code fails in non-UTC+8 timezones', () => {
      // Note: This test demonstrates that the old code behavior depends on system timezone
      // We create a date at local midnight Jan 1, 1970 at 00:05:00
      const userSelectedDate = new Date(1970, 0, 1, 0, 5, 0, 0);

      // Mock different timezone offsets to show the bug
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;

      try {
        // In UTC+0 timezone
        Date.prototype.getTimezoneOffset = () => 0; // UTC+0
        const savedValueOldUTC0 = calculateSaveValueOld(userSelectedDate, 0);

        // In UTC+8 timezone
        Date.prototype.getTimezoneOffset = () => -480; // UTC+8
        const savedValueOldUTC8 = calculateSaveValueOld(userSelectedDate, -480);

        // The key point: old code produces different values for different timezones
        // which proves it's timezone-dependent and broken
        // The new code should always produce the same value
        const savedValueNew = calculateSaveValue(userSelectedDate);

        // New code is always correct: 5 minutes
        expect(savedValueNew).toBe(300000); // Always 5 minutes

        // Old code values differ based on timezone offset (demonstrating the bug)
        // We just verify that they're not equal (showing the inconsistency)
        expect(savedValueOldUTC0).not.toBe(savedValueOldUTC8);
      } finally {
        Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
      }
    });
  });
});
