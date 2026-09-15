// What the phone actually gave us, measured - not what we assumed.
//
// Matt reported a band of dead space along the bottom of every screen, three
// times. The first two fixes were theories. This one came off the pixels:
// four screenshots from his iPhone 16 Pro (402x874 CSS, 3x), calibrated
// against the bug button, which is a known 40px circle a known distance from
// the bottom of the viewport. The circle measured 40px across and its bottom
// edge sat 770px down a 874px screen. The button is pinned 8px + the 34px
// home-indicator inset above the bottom of the viewport, so the viewport was
// 770 + 8 + 34 = 812px tall - on an 874px screen, drawn from y=0. The last
// 62px of the phone, exactly the height of the status bar, was outside the
// layout entirely. iOS filled it with the page background, so it looked like
// the app had simply stopped.
//
// The cause was `apple-mobile-web-app-status-bar-style: black-translucent`
// (see index.html), now `black`. This module is the seatbelt: if a phone
// still hands back a viewport shorter than its screen, the home indicator is
// outside the viewport too, so the bottom safe-area padding is reserving room
// for something that isn't over the app. `html[data-viewport="clipped"]` in
// main.scss drops it and gives those pixels back.

// `navigator.standalone` is the iOS-only original and is not in lib.dom.
type IosNavigator = Navigator & { standalone?: boolean };

const isStandalone = (): boolean => (window.navigator as IosNavigator).standalone === true
  || window.matchMedia?.('(display-mode: standalone)').matches === true;

// How much of the screen the layout viewport never reaches. Only meaningful
// installed: in a browser the difference is the toolbars, which are real.
const lostAtBottom = (): number => {
  if (!isStandalone()) return 0;
  const screenHeight = window.screen?.height || 0;
  if (!screenHeight) return 0;
  return Math.max(0, Math.round(screenHeight - window.innerHeight));
};

// One line, for the readout under the build stamp (tap it). This exists so
// the next layout report arrives with numbers on it instead of a guess.
export const viewportLine = (): string => {
  const visual = window.visualViewport;
  const lost = lostAtBottom();
  return [
    `${window.innerWidth}x${window.innerHeight} in ${window.screen?.width}x${window.screen?.height}`,
    visual ? `visual ${Math.round(visual.width)}x${Math.round(visual.height)}` : null,
    `${window.devicePixelRatio}x`,
    isStandalone() ? 'installed' : 'browser',
    lost ? `${lost}px unreachable` : 'full height',
  ].filter(Boolean).join(' · ');
};

// Mark the document so the stylesheet can stop reserving the home-indicator
// inset when the home indicator is not over us. Re-measures on rotate and on
// every viewport resize, because the answer changes with orientation.
export const watchViewport = (): void => {
  const apply = () => {
    document.documentElement.dataset.viewport = lostAtBottom() > 8 ? 'clipped' : 'full';
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
};
