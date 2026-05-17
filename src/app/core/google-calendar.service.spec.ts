import { TestBed } from '@angular/core/testing';
import { GoogleCalendarService } from './google-calendar.service';
import { Group, Member, Venue } from '../models';

function mockMember(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id, name: `Member ${id}`, name_hiragana: null, name_roman: null, emoji: null,
    photo_url: null, color: null, color_name: null, birthdate: null, nickname: null,
    instagram: null, facebook: null, x: null, maid_url: null, notes: null,
    company_id: null, no_sns: false, updated_at: '2026-01-01', created_at: '2026-01-01',
    ...overrides,
  };
}

const baseGroup: Group = {
  id: 'g1', name: 'Group 1', name_jp: null, photo_url: null, color: '#000',
  company: null, company_id: null, founded_at: null, disbanded_at: null,
  notes: null, is_trainee: false, style: null, instagram: null, facebook: null,
  x: null, youtube: null, updated_at: '2026-01-01', created_at: '2026-01-01',
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

  it('matchesMember: does not match short-name member (2 chars) listed under performer keyword without (From X)', () => {
    const member = mockMember('m5', { name: 'もも' });
    const event = {
      id: 'e-live',
      summary: '夏日LIVE',
      description: '演出者\nもも',
      start: { dateTime: '2026-07-01T18:00:00+08:00' },
    };
    expect((service as any).matchesMember(event, member)).toBeFalse();
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
});

describe('matchesGroup', () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
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

  // description organizer keyword matching
  it('matches group name near "presents" in description', () => {
    expect((service as any).matchesGroup(
      mkEvent('氧鋰氖生誕祭', '', '未確認感情体presents『ねぇ、私の心臓、食べてみて？』'),
      mkGroup('未確認感情体'),
    )).toBeTrue();
  });

  it('matches group name near "主辦" in description', () => {
    expect((service as any).matchesGroup(
      mkEvent('春季演唱會', '', '主辦：乃木坂46\n詳情請見官網'),
      mkGroup('乃木坂46'),
    )).toBeTrue();
  });

  it('matches group name near "主催" in description', () => {
    expect((service as any).matchesGroup(
      mkEvent('live event', '', '主催：未確認感情体'),
      mkGroup('未確認感情体'),
    )).toBeTrue();
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
});
