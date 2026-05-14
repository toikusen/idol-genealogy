import { TestBed } from '@angular/core/testing';
import { GoogleCalendarService } from './google-calendar.service';
import { Venue } from '../models';

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
    const venue = { ...baseVenue, name: '台中 Legacy' };

    expect((service as any).matchesVenue(event, venue)).toBeTrue();
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
      spyOn(service as any, 'fetchUpcomingEvents').and.returnValue(Promise.resolve(rawEvents));
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
});
