/** A button on the banner besides Dismiss (MK-97: Retry); pressing it closes the banner. */
export interface BannerAction {
  label: string;
  onClick(): void;
}

/** Shows a dismissible error banner over the game (e.g. an unknown scenario name). */
export function showErrorBanner(
  title: string,
  details: string[],
  action?: BannerAction,
): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.setAttribute('role', 'alert');

  const heading = document.createElement('strong');
  heading.textContent = title;
  banner.append(heading);

  if (details.length > 0) {
    const list = document.createElement('ul');
    for (const detail of details) {
      const item = document.createElement('li');
      item.textContent = detail;
      list.append(item);
    }
    banner.append(list);
  }

  if (action) {
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'error-banner-action';
    act.textContent = action.label;
    act.addEventListener('click', () => {
      banner.remove();
      action.onClick();
    });
    banner.append(act, ' ');
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Dismiss';
  close.addEventListener('click', () => banner.remove());
  banner.append(close);

  document.body.append(banner);
  return banner;
}
