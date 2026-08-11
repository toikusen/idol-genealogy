import { normalizeVenueType, parseVenueAddress, venueMapUrl } from './venue-address.utils';

describe('parseVenueAddress', () => {
  // The four postal-code shapes present in the live venues table.
  it('parses a 3-digit postal code', () => {
    expect(parseVenueAddress('114台北市內湖區行愛路78巷28號6F-5'))
      .toEqual({ city: '台北市', district: '內湖區' });
  });

  it('parses a 5-digit postal code', () => {
    expect(parseVenueAddress('10862臺北市萬華區昆明街76號'))
      .toEqual({ city: '台北市', district: '萬華區' });
  });

  it('parses a 6-digit postal code', () => {
    expect(parseVenueAddress('700002臺南市中西區淺草里康樂街122號地下'))
      .toEqual({ city: '台南市', district: '中西區' });
  });

  it('parses an address with no postal code', () => {
    expect(parseVenueAddress('台南市東區東門路一段13號1樓'))
      .toEqual({ city: '台南市', district: '東區' });
  });

  it('normalizes 臺 to 台 in both parts', () => {
    expect(parseVenueAddress('100臺北市中正區羅斯福路一段94號B1'))
      .toEqual({ city: '台北市', district: '中正區' });
  });

  it('handles a 縣 plus 縣轄市 district', () => {
    expect(parseVenueAddress('302新竹縣竹北市光明六路1號'))
      .toEqual({ city: '新竹縣', district: '竹北市' });
  });

  it('handles 新北市 districts', () => {
    expect(parseVenueAddress('220新北市板橋區中山路二段101號B1'))
      .toEqual({ city: '新北市', district: '板橋區' });
  });

  it('degrades to nulls rather than throwing on unparseable input', () => {
    expect(parseVenueAddress('')).toEqual({ city: null, district: null });
    expect(parseVenueAddress(null)).toEqual({ city: null, district: null });
    expect(parseVenueAddress('地址未公開')).toEqual({ city: null, district: null });
  });
});

describe('normalizeVenueType', () => {
  it('collapses the newline present in real data', () => {
    expect(normalizeVenueType('Live\n   House')).toBe('Live House');
  });

  it('returns null for blank values', () => {
    expect(normalizeVenueType('   ')).toBeNull();
    expect(normalizeVenueType(null)).toBeNull();
  });
});

describe('venueMapUrl', () => {
  it('prefers the curated maps url', () => {
    expect(venueMapUrl({ google_maps_url: 'https://maps.app.goo.gl/abc', address: 'x' }))
      .toBe('https://maps.app.goo.gl/abc');
  });

  it('falls back to a maps search on the address', () => {
    expect(venueMapUrl({ google_maps_url: null, address: '台北市萬華區昆明街76號' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('台北市萬華區昆明街76號'));
  });
});
