import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cookie-banner.component.html'
})
export class CookieBannerComponent {
  showBanner = typeof localStorage !== 'undefined'
    ? localStorage.getItem('cookie_consent') !== 'accepted'
    : false;

  accept(): void {
    localStorage.setItem('cookie_consent', 'accepted');
    this.showBanner = false;
  }
}
