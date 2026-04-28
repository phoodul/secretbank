import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "@/lib/i18n";
import { OfflineBadge } from "../OfflineBadge";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("OfflineBadge", () => {
  let originalOnLine: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  });
  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, "onLine", originalOnLine);
    }
  });

  it("renders nothing when navigator.onLine is true", () => {
    setOnline(true);
    const { container } = render(<OfflineBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the offline indicator when navigator.onLine is false", () => {
    setOnline(false);
    render(<OfflineBadge />);
    expect(screen.getByTestId("offline-badge")).toBeInTheDocument();
  });

  it("toggles based on online/offline events", async () => {
    setOnline(true);
    render(<OfflineBadge />);
    expect(screen.queryByTestId("offline-badge")).toBeNull();

    await act(async () => {
      setOnline(false);
    });
    expect(screen.getByTestId("offline-badge")).toBeInTheDocument();

    await act(async () => {
      setOnline(true);
    });
    expect(screen.queryByTestId("offline-badge")).toBeNull();
  });
});
