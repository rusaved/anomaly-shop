// What: the HTML panel (below the shop in portrait, right of it in landscape): title row, body for the deal and shop (M1), side slot.
// Called by: src/main.ts (create once); src/ui/community.ts fills the side slot; M1 fills the body.
// Keep: one panel element with stable data-panel hooks; position and size come from the layout CSS, not from here.

export interface Panel {
  root: HTMLElement;
  body: HTMLElement;
  side: HTMLElement;
  setTitle(text: string): void;
}

export function createPanel(parent: HTMLElement, title: string): Panel {
  const root = document.createElement('section');
  root.id = 'panel';
  root.innerHTML = '<div class="panel-title" data-panel="title"></div><div class="panel-body" data-panel="body"></div><div class="panel-side" data-panel="side"></div>';
  parent.appendChild(root);
  const titleEl = root.querySelector('[data-panel="title"]') as HTMLElement;
  titleEl.textContent = title;
  return {
    root,
    body: root.querySelector('[data-panel="body"]') as HTMLElement,
    side: root.querySelector('[data-panel="side"]') as HTMLElement,
    setTitle(text) {
      titleEl.textContent = text;
    },
  };
}
