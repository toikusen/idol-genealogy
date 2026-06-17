import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FloatingPanelStateService {
  private readonly panelIds = new Set<symbol>();
  private readonly openCount = signal(0);

  readonly hasOpenPanel = computed(() => this.openCount() > 0);

  register(): () => void {
    const id = Symbol('floating-panel');
    this.panelIds.add(id);
    this.openCount.set(this.panelIds.size);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.panelIds.delete(id);
      this.openCount.set(this.panelIds.size);
    };
  }
}
