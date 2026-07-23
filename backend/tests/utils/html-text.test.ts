/**
 * htmlToPlainText: server-side HTML strip for the descriptionText search mirror.
 * Search must match only visible text - never tags, attributes, or styles.
 */
import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../../src/utils/html-text';

describe('htmlToPlainText', () => {
  it('strips tags and keeps visible text with word boundaries', () => {
    expect(htmlToPlainText('<p>Hello</p><p>World</p>')).toBe('Hello World');
    expect(htmlToPlainText('<h2>Deal</h2><ul><li>One</li><li>Two</li></ul>')).toBe('Deal One Two');
  });

  it('never leaks tag names, attributes, or inline styles', () => {
    const html = '<span style="color: rgb(255, 0, 0)" class="fancy">red text</span>';
    const text = htmlToPlainText(html);
    expect(text).toBe('red text');
    expect(text).not.toContain('span');
    expect(text).not.toContain('color');
  });

  it('drops script and style bodies entirely', () => {
    expect(htmlToPlainText('<style>.a{color:red}</style><p>ok</p><script>alert(1)</script>')).toBe('ok');
  });

  it('decodes common and numeric entities', () => {
    expect(htmlToPlainText('caf&eacute; stays literal, &amp; decodes')).toBe('caf&eacute; stays literal, & decodes');
    expect(htmlToPlainText('A&nbsp;B &lt;tag&gt; &quot;q&quot; &#39;s&#39; &#x05D0;')).toBe('A B <tag> "q" \'s\' א');
  });

  it('preserves Hebrew text', () => {
    expect(htmlToPlainText('<p>שובר מתנה <strong>למסעדה</strong></p>')).toBe('שובר מתנה למסעדה');
  });

  it('collapses whitespace and handles empty/plain inputs', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('  plain   text  ')).toBe('plain text');
  });
});
