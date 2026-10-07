import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExtractionParseError, parseAddressExtraction, parseJobPhotoExtraction } from './parse';

describe('parseAddressExtraction', () => {
  it('turns junk placeholders into null', () => {
    const r = parseAddressExtraction(
      JSON.stringify({
        documentType: 'Utility Bill',
        fullName: 'N/A',
        addressLine: '  ',
        city: 'Onitsha',
        state: 'null',
        issueDate: '2026-09-12',
        issuer: 'Unknown',
        legibility: 'CLEAR',
      }),
    );
    assert.equal(r.documentType, 'utility_bill');
    assert.equal(r.fullName, null);
    assert.equal(r.addressLine, null);
    assert.equal(r.state, null);
    assert.equal(r.issuer, null);
    assert.equal(r.city, 'Onitsha');
    assert.equal(r.legibility, 'clear');
  });

  it('assumes the worst when legibility is missing or invalid', () => {
    assert.equal(parseAddressExtraction('{}').legibility, 'poor');
    assert.equal(parseAddressExtraction('{"legibility":"sparkly"}').legibility, 'poor');
  });

  it('falls back to "other" for an unknown document type', () => {
    assert.equal(parseAddressExtraction('{"documentType":"invoice"}').documentType, 'other');
  });

  it('accepts JSON wrapped in a code fence', () => {
    const r = parseAddressExtraction('```json\n{"city":"Enugu","legibility":"clear"}\n```');
    assert.equal(r.city, 'Enugu');
  });

  it('throws a typed error on non-JSON', () => {
    assert.throws(() => parseAddressExtraction('Sure! Here is the data'), ExtractionParseError);
    assert.throws(() => parseAddressExtraction('[1,2]'), ExtractionParseError);
  });
});

describe('parseJobPhotoExtraction', () => {
  it('only treats an explicit true as a real photo', () => {
    assert.equal(parseJobPhotoExtraction('{"isRealSitePhoto":"true"}').isRealSitePhoto, false);
    assert.equal(parseJobPhotoExtraction('{"isRealSitePhoto":true}').isRealSitePhoto, true);
  });
  it('defaults to the cautious values', () => {
    const r = parseJobPhotoExtraction('{}');
    assert.equal(r.category, 'unclear');
    assert.equal(r.workAppearsComplete, 'cannot_tell');
    assert.equal(r.photoQuality, 'blurry');
    assert.equal(r.isRealSitePhoto, false);
  });
});
