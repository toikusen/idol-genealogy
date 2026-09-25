import { TestBed } from '@angular/core/testing';
import { GoogleCalendarService, clearCalendarRawCache } from './google-calendar.service';
import { Group, Member, Venue } from '../models';

function mockMember(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id, name: `Member ${id}`, name_hiragana: null, name_roman: null, emoji: null,
    photo_url: null, color: null, color_name: null, birthdate: null, nickname: null,
    instagram: null, facebook: null, x: null, maid_url: null, notes: null,
    company_id: null, no_sns: false,
    photo_status: null, photo_notes: null, video_status: null, video_notes: null, photography_source: null,
    updated_at: '2026-01-01', created_at: '2026-01-01',
    ...overrides,
  };
}

const baseGroup: Group = {
  id: 'g1', name: 'Group 1', name_jp: null, photo_url: null, color: '#000',
  company: null, company_id: null, founded_at: null, disbanded_at: null, disbanded_announced_at: null,
  notes: null, is_trainee: false, instagram: null, facebook: null,
  x: null, youtube: null, youtube_channel_id: null, timetree_url: null,
  photo_status: null, photo_notes: null, video_status: null, video_notes: null, photography_source: null,
  updated_at: '2026-01-01', created_at: '2026-01-01',
};

const baseVenue: Venue = {
  id: 'venue-1',
  name: '杰克音樂 Jack\'s Studio',
  address: '10862臺北市萬華區昆明街76號',
  type: 'Live House',
  region: 'north',
  google_maps_url: null,
  phone: null,
  notes: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
    // rawCache is module-scoped so prerender shares one fetch across routes;
    // that also means it survives TestBed teardown and would leak between specs.
    clearCalendarRawCache();
    TestBed.configureTestingModule({
      providers: [GoogleCalendarService],
    });
    service = TestBed.inject(GoogleCalendarService);
  });

  it('matches location text prefixed with a pin icon', () => {
    const event = { id: 'e-1', location: '📍月讀貝洛音樂中心', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, name: '月讀館貝洛音樂中心 StudioLiveHouse PEPEROLL' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('matches location text prefixed with 演出地點', () => {
    const event = { id: 'e-2', location: '演出地點：Legacy Taipei 音樂展演空間', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, name: 'Legacy Taipei' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('does not match 台中 Legacy from a Legacy Taipei location', () => {
    const event = { id: 'e-legacy-tpe', location: '演出地點：Legacy Taipei 音樂展演空間', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taichung', name: '台中 Legacy', address: '407台中市西屯區安和路117號' };

    expect((service as any).matchesVenue(event, venue)).toBeFalse();
  });

  it('matches 台中 Legacy when the location includes 台中 Legacy', () => {
    const event = { id: 'e-legacy-taichung', location: '演出地點：台中 Legacy', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taichung', name: '台中 Legacy', address: '407台中市西屯區安和路117號' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('matches Legacy Taichung as 台中 Legacy', () => {
    const event = { id: 'e-legacy-taichung-en', location: '演出地點：Legacy Taichung', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taichung', name: '台中 Legacy', address: '407台中市西屯區安和路117號' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('matches 台中 Legacy when the venue uses the formal Legacy Taichung name', () => {
    const event = { id: 'e-legacy-taichung-zh', location: '演出地點：台中 Legacy', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taichung', name: 'Legacy Taichung 傳 音樂展演空間', address: '407台中市西屯區安和路117號' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('matches Legacy 台中 when the venue uses the formal Legacy Taichung name', () => {
    const event = { id: 'e-legacy-taichung-mixed', location: '演出地點：Legacy 台中', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taichung', name: 'Legacy Taichung 傳 音樂展演空間', address: '407台中市西屯區安和路117號' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
  });

  it('does not match Legacy Taipei from a Legacy Taichung location', () => {
    const event = { id: 'e-legacy-taichung-en', location: '演出地點：Legacy Taichung', start: { dateTime: '2026-05-20T19:00:00+08:00' } };
    const venue = { ...baseVenue, id: 'venue-legacy-taipei', name: 'Legacy Taipei', address: '100臺北市中正區八德路一段1號' };

    expect((service as any).matchesVenue(event, venue)).toBeFalse();
  });

  it('matches location text prefixed with 地點｜', () => {
    const event = { id: 'e-3', location: '地點｜杰克音樂', start: { dateTime: '2026-05-20T19:00:00+08:00' } };

    expect((service as any).matchesVenue(event, baseVenue)).toBeTrue();
  });

  it('does not match a different venue just because both names contain "studio"', () => {
    const clapper = { ...baseVenue, id: 'venue-clapper', name: '三創 CLAPPER STUDIO', address: '台北市中山區中山北路二段1號' };
    const event = { id: 'e-4', summary: 'IDOL X BAND FES', location: '杰克音樂 Jack\'s Studio（10862臺北市萬華區昆明街76號）', start: { dateTime: '2026-06-19T13:00:00+08:00' } };

    expect((service as any).matchesVenue(event, clapper)).toBeFalse();
  });

  it('does not match a different venue just because event description contains "live"', () => {
    const pipe = { ...baseVenue, id: 'venue-pipe', name: '水管音樂 PIPE Live Music', address: '台北市某區某路1號' };
    const event = { id: 'e-5', summary: 'VEZALiA Debut Live', location: '時藝劇場（台灣新北市三重區正義南路86巷2號）', start: { dateTime: '2026-05-16T10:30:00+08:00' } };

    expect((service as any).matchesVenue(event, pipe)).toBeFalse();
  });

  it('does not match a different venue just because event description contains "music"', () => {
    const pipe = { ...baseVenue, id: 'venue-pipe', name: '水管音樂 PIPE Live Music', address: '台北市某區某路1號' };
    const event = { id: 'e-6', summary: 'Sorry Youth x PEDRO', location: 'SUB Live（台北市南港區市民大道八段99號）', start: { dateTime: '2026-05-22T19:30:00+08:00' } };

    expect((service as any).matchesVenue(event, pipe)).toBeFalse();
  });

  it('does not match a different venue just because event title contains "Taipei"', () => {
    const clash = { ...baseVenue, id: 'venue-clash', name: 'Clash New Taipei', address: '新北市某區某路1號' };
    const event = { id: 'e-7', summary: 'BEYOOOOONDS Live in Taipei 「超越寬銀幕」', location: 'Legacy Taipei 音樂展演空間（台北市八德路一段1號）', start: { dateTime: '2026-05-24T18:00:00+08:00' } };

    expect((service as any).matchesVenue(event, clash)).toBeFalse();
  });

  it('does not match a different venue just because event title contains "in TAIPEI"', () => {
    const clash = { ...baseVenue, id: 'venue-clash', name: 'Clash New Taipei', address: '新北市某區某路1號' };
    const event = { id: 'e-8', summary: 'TIF ASIA TOUR 2026 in TAIPEI', location: '時藝劇場（台灣新北市三重區正義南路86巷2號）', start: { dateTime: '2026-05-16T17:00:00+08:00' } };

    expect((service as any).matchesVenue(event, clash)).toBeFalse();
  });

  it('does not match a different venue just because both names contain "展演空間"', () => {
    const nuzone = { ...baseVenue, id: 'venue-nuzone', name: 'NUZONE 展演空間', address: '台北市某區某路2號' };
    const event = { id: 'e-9', summary: 'BEYOOOOONDS Live in Taipei', location: 'Legacy Taipei 音樂展演空間（台北市八德路一段1號）', start: { dateTime: '2026-05-24T18:00:00+08:00' } };

    expect((service as any).matchesVenue(event, nuzone)).toBeFalse();
  });

  it('does not match a different venue just because event description mentions "Livehouse"', () => {
    const sub = { ...baseVenue, id: 'venue-sub', name: 'SUB Livehouse', address: '台北市南港區某路1號' };
    const event = { id: 'e-10', summary: 'ロクデナシ 3rd Oneman Live in Taipei', location: '台北國際會議中心 (TICC) 大會堂', description: '場地從千人 Live House 進階至視野宏偉的 TICC 大會堂', start: { dateTime: '2026-05-23T18:00:00+08:00' } };

    expect((service as any).matchesVenue(event, sub)).toBeFalse();
  });

  it('does not match a different venue just because event location contains another livehouse name', () => {
    const sub = { ...baseVenue, id: 'venue-sub', name: 'SUB Livehouse', address: '台北市南港區某路1號' };
    const event = { id: 'e-11', summary: 'FACE TO IDOL 偶像大作戰', location: '訊號音樂SIGNAL Livehouse（台南市中西區康樂街122號）', start: { dateTime: '2026-06-20T20:00:00+08:00' } };

    expect((service as any).matchesVenue(event, sub)).toBeFalse();
  });

  it('matches SUB Live as an alias of SUB Livehouse', () => {
    const sub = { ...baseVenue, id: 'venue-sub', name: 'SUB Livehouse', address: '115臺北市南港區市民大道八段99號' };
    const event = {
      id: 'e-sub-live',
      summary: 'Sorry Youth x PEDRO',
      location: '',
      description: '演出地點：SUB Live\n演出時間：OPEN 18:30 / START 19:30',
      start: { dateTime: '2026-05-22T19:30:00+08:00' },
    };

    expect((service as any).matchesVenue(event, sub)).toBeTrue();
  });

  it('does not match a venue that appears only in description narrative (no indicator prefix)', () => {
    const zepp = { ...baseVenue, id: 'venue-zepp', name: 'Zepp New Taipei', address: '新北市新莊區某路1號' };
    const event = {
      id: 'e-12',
      summary: 'ロクデナシ 3rd Oneman Live in Taipei',
      location: '',
      description: '演出地點：台北國際會議中心 (TICC) 大會堂\n回想 2025 年在 Zepp New Taipei 的演出，ninzin 以幽幻空靈的美聲震撼全場。',
      start: { dateTime: '2026-05-23T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, zepp)).toBeFalse();
  });

  it('does not match a venue whose only CJK bigrams come from a generic stopword phrase', () => {
    const loi = { ...baseVenue, id: 'venue-loi', name: 'Loi了咖啡 音樂展演空間', address: '台北市某區某路3號' };
    const event = {
      id: 'e-14',
      summary: 'BEYOOOOONDS Live in Taipei',
      location: '',
      description: '➤演出地點：Legacy Taipei 音樂展演空間\n➤演出地址：台北市八德路一段1號',
      start: { dateTime: '2026-05-24T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, loi)).toBeFalse();
  });

  it('does not match a venue whose name is a prefixed venue-type suffix (音樂藝文展演空間)', () => {
    const venue = { ...baseVenue, id: 'venue-art', name: 'Venue 音樂藝文展演空間', address: '台北市某區某路4號' };
    const event = {
      id: 'e-15',
      summary: 'BEYOOOOONDS Live in Taipei',
      location: '',
      description: '➤演出地點：Legacy Taipei 音樂展演空間\n➤演出地址：台北市八德路一段1號，華山1914創意文化園區中5A館',
      start: { dateTime: '2026-05-24T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, venue)).toBeFalse();
  });

  it('matches when venue name appears near an indicator keyword in description', () => {
    const zepp = { ...baseVenue, id: 'venue-zepp', name: 'Zepp New Taipei', address: '新北市新莊區某路1號' };
    const event = {
      id: 'e-13',
      summary: 'SUZUKI AIRI LIVE 2026 in Taipei',
      location: '',
      description: '演出地點｜Zepp New Taipei\n演出時間｜OPEN 17:00／START 18:00',
      start: { dateTime: '2026-06-21T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, zepp)).toBeTrue();
  });

  it('matches when indicator and venue name are on separate lines (【場地】\\nNUZONE format)', () => {
    const nuzone = { ...baseVenue, id: 'venue-nuzone', name: 'NUZONE 展演空間', address: '台北市大安區市民大道三段198號2樓' };
    const event = {
      id: 'e-16',
      summary: 'TOYPLA TAIWAN 6th Anniversary Series - The Carnival -',
      location: '',
      description: '2026 / 05 / 30 (六)\n【場地】\nNUZONE\n台北市大安區市民大道三段198號2樓\n【時間】\n日後公開',
      start: { dateTime: '2026-05-30T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, nuzone)).toBeTrue();
  });

  it('matches when Google Calendar HTML puts the venue after a bare 場地 label', () => {
    const nuzone = { ...baseVenue, id: 'venue-nuzone', name: 'NUZONE 展演空間', address: '106臺北市大安區市民大道三段198號2樓' };
    const event = {
      id: 'e-17',
      summary: 'TOYPLA TAIWAN 6th Anniversary Series - The Carnival -',
      location: '',
      description: '<br><div dir="auto">2026 / 05 / 30 (六)<div dir="auto">【場地】<br><div dir="auto">NUZONE<br><div dir="auto">台北市大安區市民大道三段198號2樓<div dir="auto">【時間】<br><div dir="auto">日後公開',
      start: { dateTime: '2026-05-30T18:00:00+08:00' },
    };

    expect((service as any).matchesVenue(event, nuzone)).toBeTrue();
  });

  describe('preloadForVenues', () => {
    const moondog: Venue = {
      id: 'venue-moondog',
      name: 'MOONDOG',
      address: '105臺北市松山區復興南路一段39號9F',
      type: 'Live House',
      region: 'north',
      google_maps_url: null,
      phone: null,
      notes: null,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const rawEvents = [
      {
        id: 'e1',
        summary: '杰克音樂演唱會',
        location: '杰克音樂 Jack\'s Studio',
        start: { dateTime: '2026-06-01T19:00:00+08:00' },
        status: 'confirmed',
      },
      {
        id: 'e2',
        summary: 'MOONDOG NIGHT',
        location: 'MOONDOG',
        start: { dateTime: '2026-06-02T19:00:00+08:00' },
        status: 'confirmed',
      },
      {
        id: 'e3',
        summary: '杰克第二場',
        location: '杰克音樂',
        start: { dateTime: '2026-06-08T19:00:00+08:00' },
        status: 'confirmed',
      },
    ];

    beforeEach(() => {
      spyOn(service as any, 'fetchUpcomingEvents').and.callFake((daysAhead: number) => {
        const p = Promise.resolve(rawEvents);
        (service as any).rawCache.set(daysAhead, p);
        return p;
      });
    });

    it('returns count map keyed by venue id', async () => {
      const counts = await service.preloadForVenues([baseVenue, moondog]);
      expect(counts.get('venue-1')).toBe(2);
      expect(counts.get('venue-moondog')).toBe(1);
    });

    it('calls fetchUpcomingEvents only once for multiple venues', async () => {
      const fetchSpy = (service as any).fetchUpcomingEvents as jasmine.Spy;
      await service.preloadForVenues([baseVenue, moondog]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('getUpcomingVenueEvents does not re-fetch after preloadForVenues', async () => {
      const fetchSpy = (service as any).fetchUpcomingEvents as jasmine.Spy;
      await service.preloadForVenues([baseVenue]);
      (service as any).cache.clear();
      await service.getUpcomingVenueEvents(baseVenue);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns all matching events without a 4-item cap', async () => {
      const manyEvents = Array.from({ length: 6 }, (_, i) => ({
        id: `e${i}`,
        summary: `杰克 Event ${i}`,
        location: '杰克音樂 Jack\'s Studio',
        start: { dateTime: `2026-06-${(i + 1).toString().padStart(2, '0')}T19:00:00+08:00` },
        status: 'confirmed',
      }));
      (service as any).fetchUpcomingEvents.and.returnValue(Promise.resolve(manyEvents));
      const events = await service.getUpcomingVenueEvents(baseVenue);
      expect(events.length).toBe(6);
    });
  });

  it('matchesMember: matches short-name member via (From Group) pattern', () => {
    const member = mockMember('m1', { name: 'もも' });
    const event = {
      id: 'e-seitan',
      summary: '綿空もり生誕祭2026',
      description: '🤍演出者🤍\nもも(From Pure Maker)',
      start: { dateTime: '2026-06-06T17:30:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeTrue();
  });

  it('matchesMember: does not match a different member via (From Group) pattern', () => {
    const member = mockMember('m2', { name: '幻波' });
    const event = {
      id: 'e-seitan',
      summary: '綿空もり生誕祭2026',
      description: '🤍演出者🤍\nもも(From Pure Maker)',
      start: { dateTime: '2026-06-06T17:30:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeFalse();
  });

  it('matchesMember: matches longer-name member via performer keyword', () => {
    const member = mockMember('m3', { name: '初恋ちゃん' });
    const event = {
      id: 'e-live',
      summary: '夏日LIVE',
      description: '演出者\n初恋ちゃん',
      start: { dateTime: '2026-07-01T18:00:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeTrue();
  });

  it('matchesMember: matches short-name member (2 chars) listed as exact phrase under performer keyword', () => {
    // Design note: 2-char kana names (e.g. "もも", "しか") now match when they appear
    // as the sole content of a performer-list line. The (From X) pattern remains the
    // preferred way to disambiguate common names across groups, but exact-phrase matching
    // in performer context is accepted for short unique stage names.
    const member = mockMember('m5', { name: 'もも' });
    const event = {
      id: 'e-live',
      summary: '夏日LIVE',
      description: '演出者\nもも',
      start: { dateTime: '2026-07-01T18:00:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeTrue();
  });

  it('matchesMember: matches member roman name in event title', () => {
    const member = mockMember('m4', { name: '春花', name_roman: 'Haruka' });
    const event = {
      id: 'e-solo',
      summary: 'Haruka Solo Live 2026',
      description: null,
      start: { dateTime: '2026-08-01T19:00:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeTrue();
  });

  it('matchesMember: matches roman name listed exactly under performer keyword', () => {
    const member = mockMember('m6', { name: 'まる', name_roman: 'maru' });
    const event = {
      id: 'e-roman-exact',
      summary: '夏日LIVE',
      description: '演出者\nmaru',
      start: { dateTime: '2026-07-01T18:00:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeTrue();
  });

  it('matchesMember: does NOT match roman member name embedded in a different performer name', () => {
    const member = mockMember('m7', { name: 'まる', name_roman: 'maru' });
    const event = {
      id: 'idol-x-band-fes',
      summary: 'IDOL X BAND FES',
      description: 'GUEST\n午場｜終焉Rebirth、THE∆RAREz、RUKA BANANA、OMOCHIおもち\n晚場｜終焉Rebirth、存在証明NO FACE NO REaLiTY with 不要臉樂團、Maru Z(HK)、悪戯ピエロ\nBAND\n台上見俱樂部\n※ 主辦方保留最終解釋權 ※',
      start: { date: '2026-06-19' },
    };
    expect((service as any).matchesMember(event, member)).toBeFalse();
  });

  it('matchesGroup: matches group listed under 演出陣容 keyword with comma-separated performers', () => {
    const group: Group = { ...baseGroup, id: 'shojogacha', name: '少女ガチャポン' };
    const event = {
      id: 'e-unknown',
      summary: '【Unknown vol.10】',
      description: '■ 演出陣容：\n《昼》\n小浜ゆみな、Nevaris-ネヴァリス、少女ガチャポン、デュアリア',
      start: { dateTime: '2026-06-07T12:00:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('matchesGroup: matches non-CJK group in comma-separated performer line', () => {
    const group: Group = { ...baseGroup, id: 'sol-luna', name: 'SOL☆LUNA ᯓ★sora' };
    const event = {
      id: 'e-unknown',
      summary: '【Unknown vol.10】',
      description: '■ 演出陣容：\n《昼》\n少女ガチャポン、SOL☆LUNA ᯓ★sora、デュアリア',
      start: { dateTime: '2026-06-07T12:00:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('matchesGroup: matches multi-word non-CJK group name listed under performer keyword', () => {
    const group: Group = { ...baseGroup, id: 'pure-maker', name: 'Pure maker' };
    const event = {
      id: 'e-live',
      summary: '推しは増やすものだ SP.9',
      description: '🎤午場出演者🎤\n♪ Pure maker\n♪ 幻波SYNC',
      start: { dateTime: '2026-05-17T10:30:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('matchesGroup: matches multi-word non-CJK group name with organizer typo in capitalisation', () => {
    const group: Group = { ...baseGroup, id: 'pure-maker', name: 'Pure maker' };
    const event = {
      id: 'e-acosta',
      summary: 'acosta!@台北vol.2',
      description: '【出演】\nPure makeR',
      start: { dateTime: '2026-05-17T15:30:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('matchesGroup: matches CJK+Latin mixed name when DB has space but event description does not', () => {
    const group: Group = { ...baseGroup, id: 'genpa-sync', name: '幻波 SYNC' };
    const event = {
      id: 'e-ssr',
      summary: 'SSrグループ公演Vol.10',
      description: '演出者：\n幻波SYNC\n初恋Eternal',
      start: { dateTime: '2026-05-23T17:00:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('matchesGroup: matches CJK+Latin mixed name when event description has space but DB does not', () => {
    const group: Group = { ...baseGroup, id: 'genpa-sync', name: '幻波SYNC' };
    const event = {
      id: 'e-ssr',
      summary: 'SSrグループ公演Vol.10',
      description: '演出者：\n幻波 SYNC\n初恋Eternal',
      start: { dateTime: '2026-05-23T17:00:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeTrue();
  });

  it('does not match a group when event only references it via (From Group) in description', () => {
    const group: Group = { ...baseGroup, id: 'pure-maker', name: 'Pure Maker' };
    const event = {
      id: 'e-seitan',
      summary: '綿空もり生誕祭2026',
      description: '🤍演出者🤍\nもも(From Pure Maker)',
      start: { dateTime: '2026-06-06T17:30:00+08:00' },
    };
    expect((service as any).matchesGroup(event, group)).toBeFalse();
  });

  describe('fetch layer', () => {
    function okResponse(body: unknown) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    }

    it('sends no Referer header in the browser (the browser sets it)', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(okResponse({ items: [] }));
      await (service as any).fetchUpcomingEvents(90);
      expect(fetchSpy.calls.mostRecent().args[1]).toBeUndefined();
    });

    it('sends a Referer header when not running in a browser', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(okResponse({ items: [] }));
      (service as any).isBrowser = false;
      await (service as any).fetchUpcomingEvents(90);
      const init = fetchSpy.calls.mostRecent().args[1] as RequestInit;
      expect((init.headers as Record<string, string>)['Referer']).toContain('http');
    });

    it('requests the Taipei time zone and a 250-event page size', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(okResponse({ items: [] }));
      await (service as any).fetchUpcomingEvents(90);
      const url = fetchSpy.calls.mostRecent().args[0] as string;
      expect(url).toContain('timeZone=Asia%2FTaipei');
      expect(url).toContain('maxResults=250');
    });

    it('follows nextPageToken and concatenates pages', async () => {
      const page1 = { items: [{ id: 'a', start: { dateTime: '2026-08-15T19:00:00+08:00' } }], nextPageToken: 'tok' };
      const page2 = { items: [{ id: 'b', start: { dateTime: '2026-08-16T19:00:00+08:00' } }] };
      const fetchSpy = spyOn(window, 'fetch').and.returnValues(okResponse(page1), okResponse(page2));
      const events = await (service as any).fetchUpcomingEvents(90);
      expect(events.map((e: any) => e.id)).toEqual(['a', 'b']);
      expect(fetchSpy.calls.count()).toBe(2);
      expect(fetchSpy.calls.mostRecent().args[0] as string).toContain('pageToken=tok');
    });

    it('drops a rejected fetch from the cache so the next page retries', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValues(
        Promise.resolve({ ok: false, status: 403 } as Response),
        okResponse({ items: [] }),
      );

      await expectAsync((service as any).fetchUpcomingEvents(90)).toBeRejected();
      await (service as any).fetchUpcomingEvents(90);

      expect(fetchSpy.calls.count()).toBe(2);
    });

    it('shares one raw fetch across service instances (prerender reuse)', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(okResponse({ items: [] }));
      await (service as any).fetchUpcomingEvents(90);
      const second = TestBed.inject(GoogleCalendarService);
      await (second as any).fetchUpcomingEvents(90);
      expect(fetchSpy.calls.count()).toBe(1);
    });
  });

  describe('getUpcomingVenueEventsResult', () => {
    it('reports unconfigured without calling the API', async () => {
      spyOn(service, 'isConfigured').and.returnValue(false);
      const fetchSpy = spyOn(window, 'fetch');
      expect(await service.getUpcomingVenueEventsResult(baseVenue))
        .toEqual({ events: [], status: 'unconfigured' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports error rather than an empty schedule when the API fails', async () => {
      spyOn(console, 'warn');
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve({ ok: false, status: 403 } as Response),
      );
      const result = await service.getUpcomingVenueEventsResult(baseVenue);
      expect(result.status).toBe('error');
      expect(result.events).toEqual([]);
    });

    it('reports ok with an empty list when the venue genuinely has no shows', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response),
      );
      expect(await service.getUpcomingVenueEventsResult(baseVenue))
        .toEqual({ events: [], status: 'ok' });
    });
  });
});

describe('matchesGroup', () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
    clearCalendarRawCache();
    TestBed.configureTestingModule({ providers: [GoogleCalendarService] });
    service = TestBed.inject(GoogleCalendarService);
  });

  function mkEvent(summary: string, location = '', description = ''): any {
    return { id: 'e1', summary, location, description, status: 'confirmed', start: { dateTime: '2026-06-01T10:00:00' } };
  }

  function mkGroup(name: string, name_jp: string | null = null): any {
    return { id: 'g1', name, name_jp } as any;
  }

  it('matches group name found in summary', () => {
    expect((service as any).matchesGroup(mkEvent('乃木坂46 ライブ'), mkGroup('乃木坂46'))).toBeTrue();
  });

  it('matches name_jp in summary', () => {
    expect((service as any).matchesGroup(mkEvent('ピンクハット ライブ'), mkGroup('Pink Hat', 'ピンクハット'))).toBeTrue();
  });

  it('matches alphanumeric name in summary with token boundary', () => {
    expect((service as any).matchesGroup(mkEvent('AKB48 concert'), mkGroup('AKB48'))).toBeTrue();
  });

  it('does NOT match alphanumeric name embedded in another word', () => {
    expect((service as any).matchesGroup(mkEvent('spring concert'), mkGroup('RING'))).toBeFalse();
  });

  it('does NOT match short CJK name (< 3 chars) anywhere', () => {
    expect((service as any).matchesGroup(mkEvent('嵐 コンサート'), mkGroup('嵐'))).toBeFalse();
  });

  it('does NOT match short alpha name (< 4 chars) in summary', () => {
    expect((service as any).matchesGroup(mkEvent('AKB live'), mkGroup('AKB'))).toBeFalse();
  });

  it('does NOT match description without any organizer or performer keyword', () => {
    expect((service as any).matchesGroup(
      mkEvent('live show', '', '乃木坂46の元メンバーによる特別公演'),
      mkGroup('乃木坂46'),
    )).toBeFalse();
  });

  it('matches CJK name in location when length >= 4', () => {
    expect((service as any).matchesGroup(mkEvent('live show', '乃木坂46'), mkGroup('乃木坂46'))).toBeTrue();
  });

  it('does NOT match CJK name in location when length < 4 (only 3 CJK chars)', () => {
    expect((service as any).matchesGroup(mkEvent('show', '乃木坂'), mkGroup('乃木坂'))).toBeFalse();
  });

  it('does NOT match alpha name in location when length < 6', () => {
    expect((service as any).matchesGroup(mkEvent('show', 'AKB48 venue'), mkGroup('AKB48'))).toBeFalse();
  });

  it('handles full-width alphanumeric via NFKC normalization', () => {
    expect((service as any).matchesGroup(mkEvent('ＡＫＢ４８ concert'), mkGroup('AKB48'))).toBeTrue();
  });

  // Short CJK/Kana name with punctuation (< 3 Kana/CJK chars, but distinctive)
  it('matches short Kana name with punctuation in summary (e.g. おれ。)', () => {
    expect((service as any).matchesGroup(
      mkEvent('おれ。1st Single Release Live ～Side by Side～'),
      mkGroup('おれ。'),
    )).toBeTrue();
  });

  it('does NOT match single Kana char even with punctuation', () => {
    expect((service as any).matchesGroup(
      mkEvent('あ。コンサート'),
      mkGroup('あ。'),
    )).toBeFalse(); // nfkc.length = 2 < 3
  });

  // Very short kana member/group name (2 chars, e.g. "しか") listed in performer list
  it('matches 2-char kana name listed as own phrase under performer keyword', () => {
    const desc = '演出者：\n幻波SYNC\n初恋Eternal\nしか';
    expect((service as any).matchesGroup(mkEvent('SSrグループ公演Vol.10', '', desc), mkGroup('しか'))).toBeTrue();
  });

  it('does NOT match 2-char kana name when embedded in a longer phrase', () => {
    const desc = '演出者：\nしかしながら最高のライブ';
    expect((service as any).matchesGroup(mkEvent('live', '', desc), mkGroup('しか'))).toBeFalse();
  });

  it('does NOT match single-char kana name even as exact phrase', () => {
    const desc = '演出者：\nか';
    expect((service as any).matchesGroup(mkEvent('live', '', desc), mkGroup('か'))).toBeFalse();
  });

  // Organizer keyword matching is intentionally removed — organizer ≠ performer.
  // Events where the group only appears as 主辦/presents/主催 must not show in 近期活動.
  it('does NOT match group name near "presents" in description (organizer ≠ performer)', () => {
    expect((service as any).matchesGroup(
      mkEvent('氧鋰氖生誕祭', '', '未確認感情体presents『ねぇ、私の心臓、食べてみて？』'),
      mkGroup('未確認感情体'),
    )).toBeFalse();
  });

  it('does NOT match group name near "主辦" in description (organizer ≠ performer)', () => {
    expect((service as any).matchesGroup(
      mkEvent('春季演唱會', '', '主辦：乃木坂46\n詳情請見官網'),
      mkGroup('乃木坂46'),
    )).toBeFalse();
  });

  it('does NOT match group name near "主催" in description (organizer ≠ performer)', () => {
    expect((service as any).matchesGroup(
      mkEvent('live event', '', '主催：未確認感情体'),
      mkGroup('未確認感情体'),
    )).toBeFalse();
  });

  it('does NOT match group name in description without organizer keyword', () => {
    expect((service as any).matchesGroup(
      mkEvent('live show', '', '乃木坂46の元メンバーによる特別公演'),
      mkGroup('乃木坂46'),
    )).toBeFalse();
  });

  it('does NOT match when organizer keyword present but group name absent', () => {
    expect((service as any).matchesGroup(
      mkEvent('live show', '', '乃木坂46 presents 特別公演'),
      mkGroup('AKB48'),
    )).toBeFalse();
  });

  // performer scan bleed: organizer credit appearing after GUEST keyword must not match
  it('does NOT match group listed as 主辦 appearing after GUEST performer keyword', () => {
    const desc = 'GUEST\n午場｜終焉Rebirth、THE∆RAREz、RUKA BANANA\n晚場｜終焉Rebirth、悪戯ピエロ\nBAND\n台上見俱樂部\n主辦：汐之時 x 紫苑アスター\n※ 主辦方保留最終解釋權 ※';
    expect((service as any).matchesGroup(
      mkEvent('IDOL X BAND FES', '杰克音樂 Jack\'s Studio', desc),
      mkGroup('汐之時'),
    )).toBeFalse();
  });

  // performer keyword: group listed after 演出者
  it('matches group listed on line after 演出者 keyword', () => {
    const desc = '🤍演出者🤍\n幻波SYNC\n木苺FRUCTOSE\n初恋Eternal';
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('幻波SYNC'))).toBeTrue();
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('木苺FRUCTOSE'))).toBeTrue();
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('初恋Eternal'))).toBeTrue();
  });

  it('does NOT match group NOT in performer list', () => {
    const desc = '🤍演出者🤍\n幻波SYNC\n木苺FRUCTOSE';
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('乃木坂46'))).toBeFalse();
  });

  it('matches group inline with 出演 keyword', () => {
    expect((service as any).matchesGroup(
      mkEvent('live', '', '幻波SYNCが出演します'),
      mkGroup('幻波SYNC'),
    )).toBeTrue();
  });

  // (From X) pattern — group matching ignores this pattern
  it('does NOT match source group via (From X) pattern', () => {
    const desc = 'もも(From Pure Maker )\nOTAKU EVENT';
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('Pure Maker'))).toBeFalse();
  });

  it('does NOT match CJK source group via (From X) pattern', () => {
    const desc = '鈴花（From 幻波SYNC）';
    expect((service as any).matchesGroup(mkEvent('solo event', '', desc), mkGroup('幻波SYNC'))).toBeFalse();
  });

  it('does NOT match different group via (From X) pattern', () => {
    const desc = 'もも(From Pure Maker)';
    expect((service as any).matchesGroup(mkEvent('生誕祭', '', desc), mkGroup('幻波SYNC'))).toBeFalse();
  });

  // Short alpha names with special chars (e.g. "i<3")
  it('matches short alpha name with special char in summary (e.g. "i<3")', () => {
    expect((service as any).matchesGroup(mkEvent('i<3 1st Live'), mkGroup('i<3'))).toBeTrue();
  });

  it('matches short alpha name with special char listed under performer keyword', () => {
    const desc = '演出者：\ni<3\n月宵◇クレシェンテ';
    expect((service as any).matchesGroup(mkEvent('SSr Vol.67', '', desc), mkGroup('i<3'))).toBeTrue();
  });

  it('matches short alpha name with special char when HTML-encoded as &lt; in description', () => {
    const desc = '演出者：\ni&lt;3\n月宵◇クレシェンテ';
    expect((service as any).matchesGroup(mkEvent('SSr Vol.67', '', desc), mkGroup('i<3'))).toBeTrue();
  });

  it('does NOT match short alpha name with special char in location (below threshold)', () => {
    expect((service as any).matchesGroup(mkEvent('show', 'i<3 venue'), mkGroup('i<3'))).toBeFalse();
  });

});

describe('GoogleCalendarService — getSchedule', () => {
  let service: GoogleCalendarService;

  // 2026-08-12 15:00 Taipei — an afternoon, so "today's morning shows must
  // survive" is actually exercised.
  const NOW = new Date('2026-08-12T15:00:00+08:00');

  function grp(id: string, name: string): Group {
    return { ...baseGroup, id, name, color: '#abc' };
  }

  function timed(id: string, start: string, end?: string, extra: Record<string, unknown> = {}) {
    return {
      id, summary: `Event ${id}`, status: 'confirmed',
      start: { dateTime: start },
      ...(end ? { end: { dateTime: end } } : {}),
      ...extra,
    };
  }

  function allDay(id: string, startDate: string, endDate: string) {
    return {
      id, summary: `AllDay ${id}`, status: 'confirmed',
      start: { date: startDate }, end: { date: endDate },
    };
  }

  function withRaw(events: unknown[]): void {
    spyOn(service as any, 'fetchUpcomingEvents').and.returnValue(Promise.resolve(events));
  }

  const run = (groups: Group[] = []) => service.getSchedule(groups, { now: NOW });

  beforeEach(() => {
    clearCalendarRawCache();
    TestBed.configureTestingModule({ providers: [GoogleCalendarService] });
    service = TestBed.inject(GoogleCalendarService);
  });

  describe('bucketing', () => {
    it('keeps today’s already-finished sets in the today bucket', async () => {
      withRaw([timed('morning', '2026-08-12T10:00:00+08:00', '2026-08-12T12:00:00+08:00')]);
      const result = await run();
      expect(result.today.timed.map(e => e.id)).toEqual(['morning']);
    });

    it('puts a still-running event that started yesterday in carryover', async () => {
      withRaw([timed('night', '2026-08-11T22:00:00+08:00', '2026-08-12T23:00:00+08:00')]);
      const result = await run();
      expect(result.today.carryover.map(e => e.id)).toEqual(['night']);
      expect(result.today.timed).toEqual([]);
    });

    it('keeps a yesterday event ending exactly at midnight tonight', async () => {
      // end === today 00:00 is still > now only if now is before it; at 15:00 it
      // is not, so this one is genuinely over and must go.
      withRaw([timed('edge', '2026-08-11T20:00:00+08:00', '2026-08-12T00:00:00+08:00')]);
      const result = await run();
      expect(result.today.carryover).toEqual([]);
    });

    it('keeps a yesterday event running until exactly the current instant', async () => {
      withRaw([timed('edge', '2026-08-11T20:00:00+08:00', '2026-08-12T15:00:00+08:00')]);
      const result = await run();
      expect(result.today.carryover).toEqual([]);   // end <= now
    });

    it('keeps a today event that ends exactly at midnight tonight', async () => {
      withRaw([timed('edge', '2026-08-12T22:00:00+08:00', '2026-08-13T00:00:00+08:00')]);
      const result = await run();
      expect(result.today.timed.map(e => e.id)).toEqual(['edge']);
      expect(result.upcoming).toEqual([]);
    });

    it('drops a yesterday event that has already ended', async () => {
      withRaw([timed('done', '2026-08-11T22:00:00+08:00', '2026-08-12T02:00:00+08:00')]);
      const result = await run();
      expect(result.today.carryover).toEqual([]);
      expect(result.today.timed).toEqual([]);
    });

    it('buckets by Taipei day even when the host clock is UTC', async () => {
      // 2026-08-14T01:00+08:00 is 2026-08-13T17:00Z — a UTC-based bucket would
      // file this under the 13th.
      withRaw([timed('late', '2026-08-14T01:00:00+08:00')]);
      const result = await run();
      expect(result.upcoming.map(d => d.dayKey)).toEqual(['2026-08-14']);
    });

    it('places a future overnight event only on its start day', async () => {
      withRaw([timed('over', '2026-08-14T22:00:00+08:00', '2026-08-15T03:00:00+08:00')]);
      const result = await run();
      expect(result.upcoming.map(d => d.dayKey)).toEqual(['2026-08-14']);
    });

    it('limits upcoming to today+1 … today+14', async () => {
      withRaw([
        timed('in', '2026-08-26T19:00:00+08:00'),   // today + 14
        timed('out', '2026-08-27T19:00:00+08:00'),  // today + 15
      ]);
      const result = await run();
      expect(result.upcoming.flatMap(d => d.events.map(e => e.id))).toEqual(['in']);
    });

    it('caps upcoming by event count and emits no empty day buckets', async () => {
      withRaw([
        timed('a', '2026-08-13T19:00:00+08:00'),
        timed('b', '2026-08-13T20:00:00+08:00'),
        timed('c', '2026-08-14T19:00:00+08:00'),
      ]);
      const result = await service.getSchedule([], { now: NOW, maxUpcoming: 2 });
      expect(result.upcoming.map(d => d.dayKey)).toEqual(['2026-08-13']);
      expect(result.upcoming[0].events.map(e => e.id)).toEqual(['a', 'b']);
    });
  });

  describe('all-day events', () => {
    it('treats end.date as exclusive when computing the last covered day', async () => {
      withRaw([allDay('festival', '2026-08-15', '2026-08-18')]);
      const result = await run();
      const event = result.upcoming[0].events[0];
      expect(event.allDayEndDayKey).toBe('2026-08-17');
    });

    it('reports a single-day all-day event with a null end key', async () => {
      withRaw([allDay('one', '2026-08-15', '2026-08-16')]);
      const result = await run();
      expect(result.upcoming[0].events[0].allDayEndDayKey).toBeNull();
    });

    it('never renders a bare date through the time formatter', async () => {
      // A bare YYYY-MM-DD read as a Date is UTC midnight, which prints as 08:00
      // in Taipei. The start must stay the raw date string.
      withRaw([allDay('one', '2026-08-15', '2026-08-16')]);
      const result = await run();
      expect(result.upcoming[0].events[0].start).toBe('2026-08-15');
      expect(result.upcoming[0].events[0].isAllDay).toBeTrue();
    });

    it('shows an ongoing multi-day all-day event in today’s all-day area, not carryover', async () => {
      withRaw([allDay('ongoing', '2026-08-10', '2026-08-15')]);
      const result = await run();
      expect(result.today.allDay.map(e => e.id)).toEqual(['ongoing']);
      expect(result.today.carryover).toEqual([]);
      expect(result.today.allDay[0].isOngoingAllDay).toBeTrue();
    });

    it('drops an all-day event whose last covered day is before today', async () => {
      withRaw([allDay('past', '2026-08-09', '2026-08-12')]);   // covers 09–11
      const result = await run();
      expect(result.today.allDay).toEqual([]);
      expect(result.upcoming).toEqual([]);
    });

    it('handles a month boundary', async () => {
      withRaw([allDay('cross', '2026-08-25', '2026-09-01')]);
      const result = await run();
      expect(result.upcoming[0].events[0].allDayEndDayKey).toBe('2026-08-31');
    });

    it('handles a year boundary', async () => {
      const nye = new Date('2026-12-28T15:00:00+08:00');
      const events = [allDay('newyear', '2026-12-30', '2027-01-03')];
      spyOn(service as any, 'fetchUpcomingEvents').and.returnValue(Promise.resolve(events));
      const result = await service.getSchedule([], { now: nye });
      expect(result.upcoming[0].dayKey).toBe('2026-12-30');
      expect(result.upcoming[0].events[0].allDayEndDayKey).toBe('2027-01-02');
    });
  });

  describe('related groups (strict matching)', () => {
    const alpha = grp('g-alpha', 'AlphaStar');
    const beta = grp('g-beta', 'BetaMoon');

    it('matches a group named in the summary', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, { summary: 'AlphaStar 定期公演' })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id)).toEqual(['g-alpha']);
    });

    it('matches a group listed under a performer keyword', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'Idol Night', description: '演出陣容：\nAlphaStar\nBetaMoon',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id).sort()).toEqual(['g-alpha', 'g-beta']);
    });

    it('ranks summary hits above lineup hits', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'BetaMoon presents', description: '演出陣容：\nAlphaStar\nBetaMoon',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id)).toEqual(['g-beta', 'g-alpha']);
    });

    it('lists a group once when it hits both summary and lineup', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'AlphaStar 定期公演', description: '演出陣容：\nAlphaStar\nBetaMoon',
      })]);
      const result = await run([alpha, beta]);
      const ids = result.today.timed[0].relatedGroups.map(g => g.id);
      expect(ids).toEqual(['g-alpha', 'g-beta']);   // alpha once, ranked as a summary hit
    });

    it('does NOT match a group named only in the ticket block', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'Idol Night', description: '演出陣容：\nAlphaStar\n票價：\nBetaMoon 應援方案 1500',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id)).toEqual(['g-alpha']);
    });

    it('does NOT match a group named only in the house-rules block', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'Idol Night', description: '演出陣容：\nAlphaStar\n注意事項：\n禁止拍攝 BetaMoon 過往影片',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id)).toEqual(['g-alpha']);
    });

    it('cuts the lineup at a stop keyword inside a single phrase', async () => {
      // `/` is not one of descriptionPhrases' separators, so this whole string
      // arrives as one phrase — a line-level cut alone would let BetaMoon in.
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'Idol Night', description: '演出陣容：AlphaStar／票價：支持 BetaMoon',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups.map(g => g.id)).toEqual(['g-alpha']);
    });

    it('does NOT match a group named only in the location', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, {
        summary: 'Idol Night', location: 'AlphaStar Hall',
      })]);
      const result = await run([alpha, beta]);
      expect(result.today.timed[0].relatedGroups).toEqual([]);
    });

    it('returns no chips when no groups are supplied', async () => {
      withRaw([timed('e', '2026-08-12T19:00:00+08:00', undefined, { summary: 'AlphaStar 定期公演' })]);
      const result = await run([]);
      expect(result.today.timed[0].relatedGroups).toEqual([]);
    });

    it('only scans events that survived the window and cap', async () => {
      withRaw([
        timed('kept', '2026-08-13T19:00:00+08:00', undefined, { summary: 'AlphaStar A' }),
        timed('dropped', '2026-09-30T19:00:00+08:00', undefined, { summary: 'AlphaStar B' }),
      ]);
      const spy = spyOn(service as any, 'lineupPhrases').and.callThrough();
      await run([alpha]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('status', () => {
    it('reports unconfigured without fetching', async () => {
      spyOn(service, 'isConfigured').and.returnValue(false);
      const fetchSpy = spyOn(service as any, 'fetchUpcomingEvents');
      const result = await run();
      expect(result.status).toBe('unconfigured');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports error rather than an empty day when the fetch fails', async () => {
      spyOn(service as any, 'fetchUpcomingEvents').and.returnValue(Promise.reject(new Error('boom')));
      const result = await run();
      expect(result.status).toBe('error');
      expect(result.today.timed).toEqual([]);
    });

    it('reports ok with empty buckets when there is genuinely nothing', async () => {
      withRaw([]);
      const result = await run();
      expect(result.status).toBe('ok');
      expect(result.upcoming).toEqual([]);
    });
  });
});
