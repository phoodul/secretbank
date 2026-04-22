import "@testing-library/jest-dom";

// Radix UI Pointer Events polyfill for jsdom
// Radix Select/DropdownMenu 등이 포인터 캡처 API를 사용하는데 jsdom이 미구현
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}

// Radix Select Viewport scrollIntoView polyfill for jsdom
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
}

// ResizeObserver polyfill for jsdom
// cmdk(Command) 및 Radix Popover가 ResizeObserver를 사용하는데 jsdom이 미구현
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
