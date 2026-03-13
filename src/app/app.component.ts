import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { SupabaseService } from './core/supabase.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly session$;
  constructor(private supabase: SupabaseService) {
    this.session$ = supabase.authState$;
  }
}
