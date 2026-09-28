// regression tests for cleanBody entity decoding (node --test test/*.test.mjs)
//
// 2026-09-28: extractor output reached brief leads with escaped markup still
// in it (`&lt;p&gt;...`, national-251 prothomalo member) because cleanBody
// stripped literal tags but never decoded entities first.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBody, decodeEntities } from '../lib/normalize.mjs';

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    assert.equal(decodeEntities('&lt;p&gt;'), '<p>');
    assert.equal(decodeEntities('a &amp; b'), 'a & b');
    assert.equal(decodeEntities('&quot;x&quot;'), '"x"');
  });
  it('decodes decimal and hex numeric entities', () => {
    assert.equal(decodeEntities('&#39;'), "'");
    assert.equal(decodeEntities('&#8217;'), '\u2019');
    assert.equal(decodeEntities('&#x27;'), "'");
  });
  it('keeps double-escaped text literal (no double decode)', () => {
    assert.equal(decodeEntities('&amp;lt;'), '&lt;');
  });
  it('leaves invalid code points alone', () => {
    assert.equal(decodeEntities('&#0;'), '&#0;');
    assert.equal(decodeEntities('&#x110000;'), '&#x110000;');
  });
});

describe('cleanBody entity regression', () => {
  it('strips escaped paragraph markup instead of publishing it', () => {
    const out = cleanBody('&lt;p&gt;দুদকের অভিযোগে বলা হয়েছে।&lt;/p&gt;&lt;p&gt;আরও তথ্য।&lt;/p&gt;');
    assert.ok(!out.includes('&lt;') && !out.includes('&gt;'), `entities leaked: ${out}`);
    assert.ok(!out.includes('<p>'), `tags leaked: ${out}`);
    assert.ok(out.includes('দুদকের অভিযোগে বলা হয়েছে।'), `prose lost: ${out}`);
  });
  it('still strips literal tags and collapses whitespace', () => {
    assert.equal(cleanBody('<p>  ক  </p> <b>খ</b>'), 'ক খ');
  });
  it('empty in, empty out', () => {
    assert.equal(cleanBody(''), '');
    assert.equal(cleanBody(null), '');
  });
});
