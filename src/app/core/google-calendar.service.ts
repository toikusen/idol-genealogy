import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Group, Member, Venue, VenueCalendarEvent } from '../models';

interface GoogleCalendarEventDate {
  date?: string;
  dateTime?: string;
}

interface GoogleCalendarEventResource {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  status?: string;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEventResource[];
}

@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private readonly calendarId = environment.googleCalendar?.calendarId ?? '';
  private readonly apiKey = environment.googleCalendar?.apiKey ?? '';
  private readonly cache = new Map<string, Promise<VenueCalendarEvent[]>>();
  private readonly rawCache = new Map<number, Promise<GoogleCalendarEventResource[]>>();

  isConfigured(): boolean {
    return this.calendarId.trim().length > 0 && this.apiKey.trim().length > 0;
  }

  async preloadForVenues(venues: Venue[], daysAhead = 90): Promise<Map<string, number>> {
    if (!this.isConfigured()) return new Map();
    const rawEvents = await this.fetchUpcomingEvents(daysAhead);
    const counts = new Map<string, number>();
    for (const venue of venues) {
      const count = rawEvents.filter(event => this.matchesVenue(event, venue)).length;
      if (count > 0) counts.set(venue.id, count);
    }
    return counts;
  }

  getUpcomingVenueEvents(venue: Venue, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    if (!this.isConfigured()) return Promise.resolve([]);

    const cacheKey = `venue:${venue.id}:${daysAhead}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const rawPromise = this.rawCache.get(daysAhead) ?? this.fetchUpcomingEvents(daysAhead);
    const promise = rawPromise.then(events => events
      .filter(event => this.matchesVenue(event, venue))
      .map(event => this.toVenueEvent(event)));

    this.cache.set(cacheKey, promise);
    return promise;
  }

  getUpcomingGroupEvents(group: Group, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    if (!this.isConfigured()) return Promise.resolve([]);
    const cacheKey = `group:${group.id}:${daysAhead}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const rawPromise = this.rawCache.get(daysAhead) ?? this.fetchUpcomingEvents(daysAhead);
    const promise = rawPromise.then(events =>
      events
        .filter(event => this.matchesGroup(event, group))
        .map(event => this.toVenueEvent(event)),
    );
    this.cache.set(cacheKey, promise);
    return promise;
  }

  getUpcomingMemberEvents(member: Member, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    if (!this.isConfigured()) return Promise.resolve([]);
    const cacheKey = `member:${member.id}:${daysAhead}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const rawPromise = this.rawCache.get(daysAhead) ?? this.fetchUpcomingEvents(daysAhead);
    const promise = rawPromise.then(events =>
      events
        .filter(event => this.matchesMember(event, member))
        .map(event => this.toVenueEvent(event)),
    );
    this.cache.set(cacheKey, promise);
    return promise;
  }

  private readonly GROUP_ORGANIZER_KEYWORDS = ['presents', '主辦', '主催'];
  private readonly GROUP_PERFORMER_KEYWORDS = ['演出陣容', '演出團體', '演出者', '出演者', '出演', '演出嘉賓', 'artist', 'guest', '嘉賓', 'ゲスト'];

  private stripNonCjk(s: string): string {
    return s.replace(/[^ぁ-ゖァ-ー一-鿿㐀-䶿a-z0-9]/g, '');
  }

  private matchesGroup(event: GoogleCalendarEventResource, group: Group): boolean {
    const names = [group.name, group.name_jp].filter((n): n is string => !!n);
    const summaryNfkc = (event.summary ?? '').normalize('NFKC').toLowerCase();
    const locationNfkc = (event.location ?? '').normalize('NFKC').toLowerCase();
    const summaryStripped = this.stripNonCjk(summaryNfkc);
    const locationStripped = this.stripNonCjk(locationNfkc);

    for (const name of names) {
      const nfkc = name.normalize('NFKC').toLowerCase();
      const hasCjkKana = /[ぁ-ゖァ-ー一-鿿㐀-䶿]/.test(nfkc);

      if (hasCjkKana) {
        const stripped = this.stripNonCjk(nfkc);
        const cjkKanaCount = (stripped.match(/[ぁ-ゖァ-ー一-鿿㐀-䶿]/g) ?? []).length;
        if (cjkKanaCount >= 3 && summaryStripped.includes(stripped)) return true;
        if (stripped.length >= 4 && cjkKanaCount >= 3 && locationStripped.includes(stripped)) return true;
        // Short names with distinctive punctuation (e.g. "おれ。"): match full NFKC literal
        if (cjkKanaCount < 3 && cjkKanaCount >= 1 && nfkc.length >= 3 && summaryNfkc.includes(nfkc)) return true;
      } else {
        const stripped = this.stripNonCjk(nfkc);
        const alphaCount = stripped.length;
        if (alphaCount >= 4 && this.tokenMatch(stripped, summaryNfkc)) return true;
        if (alphaCount >= 6 && this.tokenMatch(stripped, locationNfkc)) return true;
        // Short names with special chars (e.g. "i<3"): match full NFKC literal in summary.
        // Guard nfkc.length > stripped.length ensures the name actually has non-alphanumeric
        // chars (i.e. stripping removed something), so pure short names like "AKB" are excluded.
        if (alphaCount < 4 && nfkc.length > alphaCount && nfkc.length >= 3 && summaryNfkc.includes(nfkc)) return true;
      }
    }

    if (event.description) {
      if (this.groupNameNearOrganizerKeyword(names, event.description)) return true;
      if (this.groupNameNearPerformerKeyword(names, event.description)) return true;
    }

    return false;
  }

  private groupNameInPhrase(names: string[], phraseNfkc: string): boolean {
    const phraseStripped = this.stripNonCjk(phraseNfkc);
    for (const name of names) {
      const nfkc = name.normalize('NFKC').toLowerCase();
      const hasCjkKana = /[ぁ-ゖァ-ー一-鿿㐀-䶿]/.test(nfkc);
      if (hasCjkKana) {
        const stripped = this.stripNonCjk(nfkc);
        const cjkKanaCount = (stripped.match(/[ぁ-ゖァ-ー一-鿿㐀-䶿]/g) ?? []).length;
        if (cjkKanaCount >= 3 && phraseStripped.includes(stripped)) return true;
        if (cjkKanaCount < 3 && cjkKanaCount >= 1 && nfkc.length >= 3 && (phraseNfkc.includes(nfkc) || phraseStripped === stripped)) return true;
        // Very short kana names (e.g. "しか", 2 chars): allow when the phrase is exactly
        // this name. Safe in performer-list context where each line is one name.
        if (cjkKanaCount < 3 && cjkKanaCount >= 1 && stripped.length >= 2 && phraseStripped === stripped) return true;
      } else {
        const stripped = this.stripNonCjk(nfkc);
        if (stripped.length >= 4 && (this.tokenMatch(stripped, phraseNfkc) || phraseStripped === stripped)) return true;
        // Short names with special chars (e.g. "i<3"): match full NFKC literal.
        // Same guard as matchesGroup: only applies when stripping actually removed chars.
        if (stripped.length < 4 && nfkc.length > stripped.length && nfkc.length >= 3 && phraseNfkc.includes(nfkc)) return true;
      }
    }
    return false;
  }

  private groupNameNearOrganizerKeyword(names: string[], description: string): boolean {
    const phrases = this.descriptionPhrases(description);
    for (const phrase of phrases) {
      const phraseNfkc = phrase.normalize('NFKC').toLowerCase();
      const hasKeyword = this.GROUP_ORGANIZER_KEYWORDS.some(kw => phraseNfkc.includes(kw));
      if (!hasKeyword) continue;
      if (this.groupNameInPhrase(names, phraseNfkc)) return true;
    }
    return false;
  }

  private groupNameNearPerformerKeyword(names: string[], description: string): boolean {
    const phrases = this.descriptionPhrases(description);
    for (let i = 0; i < phrases.length; i++) {
      const phraseNfkc = phrases[i].normalize('NFKC').toLowerCase();
      const hasKeyword = this.GROUP_PERFORMER_KEYWORDS.some(kw => phraseNfkc.includes(kw));
      if (!hasKeyword) continue;
      // Same phrase (e.g. "幻波SYNC が出演します")
      if (this.groupNameInPhrase(names, phraseNfkc)) return true;
      // Following phrases: performers are often listed one per line after the keyword
      for (let j = i + 1; j < phrases.length; j++) {
        const nextNfkc = phrases[j].normalize('NFKC').toLowerCase();
        if (this.groupNameInPhrase(names, nextNfkc)) return true;
      }
    }
    return false;
  }

  private memberNameInFromPattern(names: string[], description: string): boolean {
    // Extracts the performer name from "name(From Group)" or "name（From Group）" format.
    // Each phrase is one line from descriptionPhrases. The regex matches text immediately
    // before a "(From " opener — precise enough to safely handle short names like "もも".
    const fromPattern = /^(.+?)\s*[（(]\s*[Ff]rom\s+/;
    for (const phrase of this.descriptionPhrases(description)) {
      const m = fromPattern.exec(phrase.trim());
      if (!m) continue;
      const extracted = m[1].trim().normalize('NFKC').toLowerCase();
      for (const name of names) {
        if (extracted === name.normalize('NFKC').toLowerCase()) return true;
      }
    }
    return false;
  }

  private matchesMember(event: GoogleCalendarEventResource, member: Member): boolean {
    const names = [member.name, member.name_hiragana, member.name_roman, member.nickname]
      .filter((n): n is string => !!n);
    if (names.length === 0) return false;

    // Layer 1: extract performer from "name(From Group)" — handles short names precisely
    if (event.description && this.memberNameInFromPattern(names, event.description)) return true;

    // Layer 2: performer keyword scan — reuses existing logic, handles names ≥ 3 CJK/kana chars
    if (event.description && this.groupNameNearPerformerKeyword(names, event.description)) return true;

    // Layer 3: title / location direct match — reuses existing phrase matching thresholds
    const summaryNfkc = (event.summary ?? '').normalize('NFKC').toLowerCase();
    const locationNfkc = (event.location ?? '').normalize('NFKC').toLowerCase();
    if (this.groupNameInPhrase(names, summaryNfkc)) return true;
    if (this.groupNameInPhrase(names, locationNfkc)) return true;

    return false;
  }

  private tokenMatch(name: string, text: string): boolean {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
  }

  private fetchUpcomingEvents(daysAhead: number): Promise<GoogleCalendarEventResource[]> {
    const cached = this.rawCache.get(daysAhead);
    if (cached) return cached;
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + daysAhead);
    const params = new URLSearchParams({
      key: this.apiKey,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: '100',
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`;
    const promise = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Google Calendar API failed: ${response.status}`);
        return response.json() as Promise<GoogleCalendarEventsResponse>;
      })
      .then(data => (data.items ?? []).filter(event => event.status !== 'cancelled' && !!event.start));
    this.rawCache.set(daysAhead, promise);
    return promise;
  }

  private matchesVenue(event: GoogleCalendarEventResource, venue: Venue): boolean {
    const location = event.location ?? '';
    const description = event.description ?? '';
    const locationIsMinimal = location.replace(/\s+/g, '').length < 5;

    const eventShortText = this.normalize(`${event.summary ?? ''} ${location}`);
    const eventLocation = this.normalizeLocation(location);
    const venueName = this.normalize(venue.name);
    const venueAddress = this.normalize(venue.address);
    const venueAliases = this.venueAliases(venue.name);

    if (venueName && eventShortText.includes(venueName)) return true;
    if (venueAddress && eventShortText.includes(venueAddress)) return true;
    if (venueAliases.some(alias => eventShortText.includes(alias) || eventLocation.includes(alias))) return true;

    // Parts matching never uses description — individual parts are too common in long text.
    const venueParts = this.venueNameParts(venue.name);
    if (this.venuePartsMatch(venueParts, eventShortText) || this.venuePartsMatch(venueParts, eventLocation)) return true;

    // When location is empty/minimal, check description — but only if the venue name
    // appears near a venue-indicator keyword (演出地點, 地點, 📍 …).
    // This prevents matching venue names that appear only in narrative/historical context.
    if (locationIsMinimal && this.venueNameNearIndicator(venueName, venueAddress, description, venueParts, venueAliases)) return true;

    // CJK bigram: use filtered venue name parts (stopwords removed) so generic CJK phrases
    // like 音樂展演空間 don't contribute bigrams and false-match other venues' descriptions.
    const venuePartsStr = venueParts.join(' ');
    return this.hasSimilarCjkName(venuePartsStr, `${location} ${description}`);
  }

  private readonly VENUE_INDICATORS = ['演出地點', '地點', '📍', '場地', '地址', 'venue', 'location'];

  private venueNameNearIndicator(
    venueName: string,
    venueAddress: string,
    desc: string,
    venueParts: string[] = [],
    venueAliases: string[] = [],
  ): boolean {
    if (!desc) return false;
    // Split on line/sentence breaks so a past-venue reference on a different line
    // cannot "borrow" an indicator from the current-venue line.
    const phrases = this.descriptionPhrases(desc);
    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      // Check indicators against the original phrase (not normalized) to avoid
      // normalize('📍') === '' making every phrase appear to have an indicator.
      const lowerPhrase = phrase.toLowerCase();
      const hasIndicator = this.VENUE_INDICATORS.some(ind => lowerPhrase.includes(ind.toLowerCase()));
      if (!hasIndicator) continue;
      // Check the current phrase (full name and address only).
      const normalizedCurrent = this.normalize(phrase);
      if (venueName && normalizedCurrent.includes(venueName)) return true;
      if (venueAddress && normalizedCurrent.includes(venueAddress)) return true;
      if (venueAliases.some(alias => normalizedCurrent.includes(alias))) return true;
      if (this.venuePartsMatch(venueParts, normalizedCurrent)) return true;
      // When the indicator phrase is a bare label with no venue value (e.g. "【場地】"),
      // the venue name is on the next line — check it too, including venueParts.
      // Guard: skip if this phrase already has meaningful content beyond the indicator
      // (e.g. "演出地點：台北國際會議中心") so we don't bleed into narrative text below.
      if (i + 1 < phrases.length && this.isIndicatorOnlyPhrase(phrase)) {
        const normalizedNext = this.normalize(phrases[i + 1]);
        if (venueName && normalizedNext.includes(venueName)) return true;
        if (venueAddress && normalizedNext.includes(venueAddress)) return true;
        if (venueAliases.some(alias => normalizedNext.includes(alias))) return true;
        if (this.venuePartsMatch(venueParts, normalizedNext)) return true;
      }
    }
    return false;
  }

  private decodeHtmlEntities(s: string): string {
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  }

  private descriptionPhrases(desc: string): string[] {
    // Decode HTML entities before splitting so entity semicolons (e.g. &lt; → <)
    // are not treated as phrase separators.
    const decoded = this.decodeHtmlEntities(
      desc
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|li)>/gi, '\n')
        .replace(/<(?:div|p|li)(?:\s[^>]*)?>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
    return decoded
      .split(/[\n\r。；;、]+/)
      .map(phrase => phrase.trim())
      .filter(Boolean);
  }

  private isIndicatorOnlyPhrase(phrase: string): boolean {
    let s = phrase.toLowerCase();
    for (const ind of this.VENUE_INDICATORS) {
      s = s.replace(new RegExp(ind.toLowerCase(), 'g'), '');
    }
    // Keep only alphanumeric and CJK characters to measure remaining content
    s = s.replace(/[^a-z0-9㐀-鿿]/g, '');
    return s.length < 3;
  }

  private readonly VENUE_STOPWORDS = new Set([
    // venue-type generics (English)
    'studio', 'live', 'house', 'livehouse', 'music', 'hall', 'center', 'centre',
    'theatre', 'theater', 'space', 'room', 'bar', 'club', 'cafe',
    // city/region names that appear in nearly every regional event
    'taipei', 'taiwan', 'tokyo', 'japan',
    // venue-type generics (Chinese) — exact matches
    '展演空間', '音樂展演空間', '展演廳', '演藝廳', '劇場', '大會堂',
  ]);

  // CJK parts that end with these suffixes are also venue-type generics regardless of prefix
  // e.g. 音樂藝文展演空間, 花漾展演空間, 傳音樂展演空間 are all just "<modifier>展演空間"
  private readonly VENUE_TYPE_SUFFIXES = ['展演空間', '展演廳', '演藝廳', '劇場', '大會堂'];
  private readonly CJK_GEO_PARTS = ['台北', '臺北', '新北', '台中', '臺中', '台南', '臺南', '高雄', '桃園', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '宜蘭', '花蓮', '台東', '臺東', '澎湖', '金門', '馬祖'];
  private readonly GEO_ALIASES: Record<string, string[]> = {
    '台北': ['taipei'], '臺北': ['taipei'],
    '新北': ['newtaipei'],
    '台中': ['taichung'], '臺中': ['taichung'],
    '台南': ['tainan'], '臺南': ['tainan'],
    '高雄': ['kaohsiung'],
    '桃園': ['taoyuan'],
    '基隆': ['keelung'],
    '新竹': ['hsinchu'],
    '嘉義': ['chiayi'],
    '屏東': ['pingtung'],
    '宜蘭': ['yilan'],
    '花蓮': ['hualien'],
    '台東': ['taitung'], '臺東': ['taitung'],
  };

  private venueNameParts(name: string): string[] {
    return name
      .split(/[\s・|｜/／()（）,，、]+/)
      .map(part => this.normalize(part))
      .filter(part => {
        if (this.VENUE_STOPWORDS.has(part) && !this.isGeoPart(part)) return false;
        // CJK parts ending with a venue-type suffix (e.g. 音樂藝文展演空間) are also generic
        if (/[㐀-鿿]/.test(part) && this.VENUE_TYPE_SUFFIXES.some(s => part.endsWith(s) && part.length > s.length)) return false;
        const hasCjk = /[㐀-鿿]/.test(part);
        return hasCjk ? part.length >= 2 : part.length >= 4;
      });
  }

  private venueAliases(name: string): string[] {
    const normalizedName = this.normalize(name);
    const venueParts = this.venueNameParts(name);
    const aliases = new Set<string>();

    // SUB Livehouse is often written as SUB Live in event descriptions.
    if (normalizedName.endsWith('livehouse')) {
      aliases.add(normalizedName.slice(0, -'house'.length));
    }

    for (const geoPart of venueParts.filter(part => this.CJK_GEO_PARTS.includes(part))) {
      for (const geoAlias of this.GEO_ALIASES[geoPart] ?? []) {
        for (const part of venueParts.filter(part => /^[a-z0-9]+$/.test(part))) {
          aliases.add(`${part}${geoAlias}`);
          aliases.add(`${geoAlias}${part}`);
        }
      }
    }

    for (const geoPart of venueParts.filter(part => this.isGeoAlias(part))) {
      for (const geoAlias of this.cjkGeoAliasesFor(geoPart)) {
        for (const part of venueParts.filter(part => /^[a-z0-9]+$/.test(part) && part !== geoPart)) {
          aliases.add(`${part}${geoAlias}`);
          aliases.add(`${geoAlias}${part}`);
        }
      }
    }

    return [...aliases].filter(alias => alias.length >= 6);
  }

  private venuePartsMatch(venueParts: string[], text: string): boolean {
    if (!text) return false;
    const hasGeoQualifier = venueParts.some(part => this.isGeoPart(part));
    const nonGeoParts = venueParts.filter(part => !this.isGeoPart(part));

    return venueParts.some(part => {
      if (!text.includes(part)) return false;
      if (this.isGeoPart(part) && nonGeoParts.length > 0) {
        return nonGeoParts.some(other => text.includes(other));
      }
      if (hasGeoQualifier && /^[a-z0-9]+$/.test(part)) {
        return venueParts.some(other => this.isGeoPart(other) && text.includes(other));
      }
      return true;
    });
  }

  private isGeoPart(part: string): boolean {
    return this.CJK_GEO_PARTS.includes(part) || this.isGeoAlias(part);
  }

  private isGeoAlias(part: string): boolean {
    return Object.values(this.GEO_ALIASES).some(aliases => aliases.includes(part));
  }

  private cjkGeoAliasesFor(part: string): string[] {
    return Object.entries(this.GEO_ALIASES)
      .filter(([, aliases]) => aliases.includes(part))
      .map(([geoPart]) => geoPart);
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[📍🗺️]/g, '')
      .replace(/[\s'"’‘“”`.,，。・|｜/／()（）\-_:：]+/g, '');
  }

  private normalizeLocation(value: string): string {
    return this.normalize(value.replace(/^(演出)?地點\s*[:：|｜]?\s*/i, ''));
  }

  private hasSimilarCjkName(venueName: string, eventText: string): boolean {
    const venueBigrams = this.cjkBigrams(venueName);
    const eventBigrams = new Set(this.cjkBigrams(eventText));
    if (venueBigrams.length < 4 || eventBigrams.size < 4) return false;

    const matches = venueBigrams.filter(bigram => eventBigrams.has(bigram)).length;
    return matches >= 4 && matches / venueBigrams.length >= 0.55;
  }

  private cjkBigrams(value: string): string[] {
    const cjk = value.replace(/[^\u3400-\u9fff]/g, '');
    const bigrams: string[] = [];
    for (let i = 0; i < cjk.length - 1; i += 1) {
      bigrams.push(cjk.slice(i, i + 2));
    }
    return [...new Set(bigrams)];
  }

  private toVenueEvent(event: GoogleCalendarEventResource): VenueCalendarEvent {
    const start = event.start?.dateTime ?? event.start?.date ?? '';
    const end = event.end?.dateTime ?? event.end?.date ?? null;
    return {
      id: event.id,
      title: event.summary ?? '未命名活動',
      start,
      end,
      location: event.location ?? null,
      url: event.htmlLink ?? null,
      isAllDay: !!event.start?.date && !event.start?.dateTime,
    };
  }
}
