import { extractMentions, extractPlainText, replaceInvalidMentions, validateBlockContent } from '../../src/shared/schemas/block.schema';

const text = (t: string) => ({ type: 'text', text: t, styles: {} });

describe('block.schema', () => {
  it('menerima paragraf & membuang properti asing (mis. onClick)', () => {
    const r = validateBlockContent('paragraph', { props: { textColor: 'red', onClick: 'alert(1)' }, content: [text('halo')], evil: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.props).toEqual({ textColor: 'red' });
      expect(r.content).not.toHaveProperty('evil');
    }
  });

  it('teks berisi <script> tetap disimpan sebagai teks biasa', () => {
    const r = validateBlockContent('paragraph', { content: [text('<script>alert(1)</script>')] });
    expect(r.ok && extractPlainText('paragraph', r.content)).toBe('<script>alert(1)</script>');
  });

  it.each([
    ['link javascript:', 'paragraph', { content: [{ type: 'link', href: 'javascript:alert(1)', content: [text('x')] }] }],
    ['image data:', 'image', { props: { url: 'data:text/html,<script>alert(1)</script>' } }],
    ['bookmark javascript:', 'bookmark', { props: { url: 'javascript:alert(1)' } }],
    ['tableCell props asing tetap ditolak tipe', 'table', { content: { type: 'tableContent', rows: [{ cells: [{ type: 'tableCell', props: { colspan: 'x' }, content: [] }] }] } }],
    ['block_type tak dikenal', 'iframe', { props: {} }],
    ['heading level 4', 'heading', { props: { level: 4 }, content: [] }],
  ])('menolak %s', (_label, type, content) => {
    expect(validateBlockContent(type, content).ok).toBe(false);
  });

  it('mengizinkan link https & mailto', () => {
    expect(validateBlockContent('paragraph', { content: [{ type: 'link', href: 'https://matrika.id', content: [text('x')] }] }).ok).toBe(true);
    expect(validateBlockContent('paragraph', { content: [{ type: 'link', href: 'mailto:a@b.co', content: [text('x')] }] }).ok).toBe(true);
  });

  it('membuang karakter kontrol', () => {
    const r = validateBlockContent('paragraph', { content: [text('a\u0000b\nc')] });
    expect(r.ok && extractPlainText('paragraph', r.content)).toBe('ab\nc');
  });

  it('plain text tabel, mention, dan checklist', () => {
    const table = validateBlockContent('table', {
      content: { type: 'tableContent', rows: [{ cells: [[text('A')], [text('B')]] }, { cells: [[text('1')], [text('2')]] }] },
    });
    expect(table.ok && extractPlainText('table', table.content)).toBe('A | B\n1 | 2');

    const id = '00000000-0000-4000-8000-000000000201';
    const withMention = validateBlockContent('checkListItem', {
      props: { checked: true },
      content: [text('Tanya '), { type: 'mention', props: { mention_type: 'agent', id, label: 'Agent_Strategist' } }],
    });
    expect(withMention.ok).toBe(true);
    if (withMention.ok) {
      expect(extractPlainText('checkListItem', withMention.content)).toBe('Tanya @Agent_Strategist');
      expect(extractMentions(withMention.content)).toEqual([{ mention_type: 'agent', id }]);
      const cleaned = replaceInvalidMentions(withMention.content, () => false);
      expect(extractMentions(cleaned)).toEqual([]);
      expect(extractPlainText('checkListItem', cleaned)).toBe('Tanya @Agent_Strategist');
    }
  });
});
