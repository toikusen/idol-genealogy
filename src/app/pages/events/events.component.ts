import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { ScheduleComponent } from '../../shared/schedule/schedule.component';

/** Standalone, linkable home for the event schedule that also lives in the home page's events tab. */
@Component({
  selector: 'app-events',
  standalone: true,
  imports: [RouterLink, ScheduleComponent],
  template: `
    <main class="events-page">
      <a routerLink="/" class="events-back-link">← 返回首頁</a>
      <header class="events-header">
        <h1>台灣地下偶像活動行程</h1>
        <p>今日與未來 14 天的地下偶像演出、特典會與活動，附完整月曆。實際內容以主辦單位公告為準。</p>
      </header>
      <app-schedule />
    </main>
  `,
  styles: `
    .events-page {
      max-width: 1080px;
      margin: 0 auto;
      padding: 1.5rem 1rem 3.5rem;
    }
    .events-back-link {
      display: inline-flex;
      margin-bottom: 1.15rem;
      color: var(--text-faint-60);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-decoration: none;
    }
    .events-header h1 {
      margin: 0 0 0.45rem;
      font-size: 1.45rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--text-primary);
    }
    .events-header p {
      max-width: 620px;
      margin: 0;
      font-size: 0.78rem;
      line-height: 1.75;
      letter-spacing: 0.04em;
      color: var(--text-faint-60);
    }
  `,
})
export class EventsComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.setPage(
      '地下偶像活動行程｜今日與未來 14 天 | Idol Maps',
      '台灣地下偶像今日與未來 14 天的演出、特典會與活動行程，附完整月曆與相關團體連結。',
      siteUrl('/events'),
    );
  }
}
