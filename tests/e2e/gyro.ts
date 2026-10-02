import type { Page } from '@playwright/test';

/**
 * Gives the page a gyro (MK-87): whenever the game starts listening for `deviceorientation`, a
 * level reading arrives, as on a real phone. Without one, Tilt falls back to Drag after 2 s.
 */
export async function withGyro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      add(type, listener, options);
      if (type !== 'deviceorientation') return;
      setTimeout(() => {
        const init = { alpha: 0, beta: 0, gamma: -45 };
        let event: Event;
        try {
          event = new DeviceOrientationEvent(type, init);
        } catch {
          event = Object.assign(new Event(type), init);
        }
        window.dispatchEvent(event);
      }, 0);
    }) as typeof window.addEventListener;
  });
}
