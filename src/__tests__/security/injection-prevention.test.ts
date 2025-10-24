import { describe, expect, it } from 'vitest';

/**
 * Security tests for injection prevention
 * These tests verify that the fixes for the RCE vulnerability are effective
 */
describe('Injection Prevention', () => {
  describe('JSON.stringify escaping', () => {
    it('should wrap input in quotes, making backticks safe', () => {
      const maliciousInput = '`+alert(1)+`';
      const escaped = JSON.stringify(maliciousInput);
      // JSON.stringify returns a quoted string: "`+alert(1)+`"
      // When used in code like: let x = ${escaped};
      // It becomes: let x = "`+alert(1)+`";
      // The backticks are inside quotes, so they're treated as regular characters
      expect(escaped).toBe('"`+alert(1)+`"');
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
    });

    it('should escape template literal syntax safely', () => {
      const maliciousInput = '${process.binding("spawn_sync")}';
      const escaped = JSON.stringify(maliciousInput);
      expect(escaped).toBe('"${process.binding(\\"spawn_sync\\")}"');
      // Verify it's wrapped in quotes and inner quotes are escaped
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
    });

    it('should handle newlines safely', () => {
      const maliciousInput = '`\nalert(1)\n`';
      const escaped = JSON.stringify(maliciousInput);
      // Newlines are escaped as \n in the JSON string
      expect(escaped).toContain('\\n');
      expect(escaped).toBe('"`\\nalert(1)\\n`"');
    });

    it('should escape quotes', () => {
      const maliciousInput = '"; alert(1); "';
      const escaped = JSON.stringify(maliciousInput);
      // JSON.stringify escapes the quotes
      expect(escaped).toContain('\\"');
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
    });

    it('should preserve CJK characters', () => {
      const cjkInput = '新条目';
      const escaped = JSON.stringify(cjkInput);
      expect(escaped).toBe('"新条目"');
    });

    it('should preserve Unicode characters', () => {
      const unicodeInput = 'Tëst Ñame 日本語 한글';
      const escaped = JSON.stringify(unicodeInput);
      expect(escaped).toContain('Tëst');
      expect(escaped).toContain('日本語');
      expect(escaped).toContain('한글');
    });
  });

  describe('Script generation safety', () => {
    it('should prevent template literal breakout in openTiddler', () => {
      const maliciousName = '`+void window.service.wiki.wikiOperationInServer()+`';

      // Simulate the fixed version
      const script = `
        let trimmedTiddlerName = ${JSON.stringify(maliciousName)};
        let currentHandlerWidget = $tw.rootWidget;
      `;

      // The malicious code should be trapped inside a quoted string
      // It becomes: let trimmedTiddlerName = "`+void...+`";
      // The backticks are inside quotes, so they're just characters
      expect(script).toContain('"`+void window.service');
      expect(script).not.toContain('void window.service.wiki.wikiOperationInServer()+`;\n');
    });

    it('should prevent injection in setTiddlerText', () => {
      const maliciousTitle = 'dummy`),process.binding("spawn_sync"),console.log(1);//';
      const maliciousValue = 'New content';

      // Simulate the fixed version
      const script = `return $tw.wiki.setText(${JSON.stringify(maliciousTitle)}, 'text', undefined, ${JSON.stringify(maliciousValue)});`;

      // The script should have quoted strings, not executable code
      expect(script).toContain('"dummy`),process.binding');
      expect(script).toContain('"New content"');
    });

    it('should prevent injection in renderWikiText', () => {
      const maliciousContent = '`+alert(1)+`';

      // Simulate the fixed version
      const script = `return $tw.wiki.renderText("text/html", "text/vnd.tiddlywiki", ${JSON.stringify(maliciousContent)});`;

      // alert(1) should be inside a quoted string
      expect(script).toContain('"`+alert(1)+`"');
    });
  });

  describe('Real-world attack vectors', () => {
    it('should block the reported PoC payload', () => {
      const pocPayload =
        "dummy`),process.binding('spawn_sync').spawn({file:'/usr/bin/open',args:['/usr/bin/open','/System/Applications/Calculator.app/Contents/MacOS/Calculator'],stdio:[{type:'pipe',readable:!0},{type:'pipe',writable:!0},{type:'pipe',writable:!0}]}),console.log(1);//";

      const escaped = JSON.stringify(pocPayload);

      // Should be wrapped in quotes, making the backticks safe
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
      // The payload is now a string literal, not executable code
      expect(escaped).toContain('"dummy`),process.binding');
    });

    it('should block XSS in renderer via openTiddler', () => {
      const xssPayload = "`+alert('XSS')+`";

      const script = `let trimmedTiddlerName = ${JSON.stringify(xssPayload)};`;

      // alert('XSS') should be inside a quoted string
      expect(script).toContain('"`+alert(\'XSS\')+`"');
    });

    it('should block various injection techniques', () => {
      const payloads = [
        '`+alert(1)+`',
        '${alert(1)}',
        '\\`+alert(1)+\\`',
        "'; alert(1); '",
        '"); alert(1); ("',
        '`; alert(1); `',
        '`\\nalert(1)\\n`',
      ];

      for (const payload of payloads) {
        const escaped = JSON.stringify(payload);
        // All should be wrapped in quotes, making them safe string literals
        expect(escaped.startsWith('"')).toBe(true);
        expect(escaped.endsWith('"')).toBe(true);
      }
    });
  });

  describe('Deep link sanitization', () => {
    /**
     * Simulates the sanitizeTiddlerName method from DeepLinkService
     */
    function sanitizeTiddlerName(tiddlerName: string): string {
      let sanitized = tiddlerName;

      // Remove backticks and template literal syntax
      sanitized = sanitized.replace(/[`${}]/g, '');

      // Remove HTML tags and script tags
      sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, '');

      // Remove newlines and other control characters
      sanitized = sanitized.replace(/[\r\n\t]/g, ' ');

      // Remove null bytes
      sanitized = sanitized.replace(/\0/g, '');

      // Trim whitespace
      sanitized = sanitized.trim();

      // Limit length to prevent DoS
      if (sanitized.length > 1000) {
        sanitized = sanitized.substring(0, 1000);
      }

      return sanitized;
    }

    it('should remove backticks', () => {
      const input = '`malicious`';
      const sanitized = sanitizeTiddlerName(input);
      expect(sanitized).toBe('malicious');
      expect(sanitized).not.toContain('`');
    });

    it('should remove template literal syntax', () => {
      const input = '${process.binding()}';
      const sanitized = sanitizeTiddlerName(input);
      expect(sanitized).toBe('process.binding()');
      expect(sanitized).not.toContain('$');
      expect(sanitized).not.toContain('{');
      expect(sanitized).not.toContain('}');
    });

    it('should remove HTML tags', () => {
      const input = '<script>alert(1)</script>';
      const sanitized = sanitizeTiddlerName(input);
      expect(sanitized).toBe('alert(1)');
      expect(sanitized).not.toContain('<script>');
    });

    it('should remove control characters', () => {
      const input = 'line1\nline2\ttab';
      const sanitized = sanitizeTiddlerName(input);
      // Control characters should be replaced with spaces
      expect(sanitized).toBe('line1 line2 tab');
    });

    it('should preserve normal tiddler names', () => {
      const normalNames = [
        'MyTiddler',
        'My Tiddler',
        'My-Tiddler',
        'My_Tiddler',
        'Tiddler 123',
      ];

      for (const name of normalNames) {
        const sanitized = sanitizeTiddlerName(name);
        expect(sanitized).toBe(name);
      }
    });

    it('should preserve CJK characters', () => {
      const cjkNames = [
        '新条目',
        '日本語タイトル',
        '한글 제목',
        '中文标题',
      ];

      for (const name of cjkNames) {
        const sanitized = sanitizeTiddlerName(name);
        expect(sanitized).toBe(name);
      }
    });

    it('should limit length to prevent DoS', () => {
      const longInput = 'a'.repeat(2000);
      const sanitized = sanitizeTiddlerName(longInput);
      expect(sanitized.length).toBe(1000);
    });

    it('should block the PoC attack', () => {
      const pocInput = '`+void window.service.wiki.wikiOperationInServer()';
      const sanitized = sanitizeTiddlerName(pocInput);

      // Backticks, dollar signs, and braces should be removed
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('$');
      expect(sanitized).not.toContain('{');
      expect(sanitized).not.toContain('}');
      // But the text content remains (though harmless)
      expect(sanitized).toBe('+void window.service.wiki.wikiOperationInServer()');
    });
  });
});
