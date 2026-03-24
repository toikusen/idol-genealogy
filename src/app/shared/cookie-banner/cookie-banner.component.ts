import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.css'
})
export class CookieBannerComponent {
  showBanner = typeof localStorage !== 'undefined'
    ? localStorage.getItem('cookie_consent') !== 'accepted'
    : false;

  accept(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cookie_consent', 'accepted');
    }
    this.showBanner = false;
  }
}
