// SPDX-License-Identifier: AGPL-3.0-or-later

import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { installTrigger, isAutofillHotkey, type TriggerEvent } from "../autofill-trigger";
import type { DetectedForm } from "../form-detector";

function makeForm(doc: Document): DetectedForm {
  const form = doc.createElement("form");
  const username = doc.createElement("input");
  username.type = "text";
  const password = doc.createElement("input");
  password.type = "password";
  form.appendChild(username);
  form.appendChild(password);
  doc.body.appendChild(form);
  return {
    formEl: form,
    passwordInput: password,
    passwordPriority: "current-password",
    usernameInput: username,
    usernamePriority: "autocomplete",
  };
}

describe("isAutofillHotkey", () => {
  function makeKeyEvent(opts: Partial<KeyboardEventInit & { key: string }>): KeyboardEvent {
    return new KeyboardEvent("keydown", { key: "L", ...opts }) as KeyboardEvent;
  }

  it("Cmd+Shift+L (macOS)", () => {
    expect(isAutofillHotkey(makeKeyEvent({ metaKey: true, shiftKey: true }))).toBe(true);
  });

  it("Ctrl+Shift+L (other)", () => {
    expect(isAutofillHotkey(makeKeyEvent({ ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("소문자 l 도 허용", () => {
    expect(isAutofillHotkey(makeKeyEvent({ key: "l", ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("Shift 없으면 거부", () => {
    expect(isAutofillHotkey(makeKeyEvent({ ctrlKey: true }))).toBe(false);
  });

  it("Ctrl/Cmd 없으면 거부", () => {
    expect(isAutofillHotkey(makeKeyEvent({ shiftKey: true }))).toBe(false);
  });

  it("Alt 함께 눌리면 거부", () => {
    expect(isAutofillHotkey(makeKeyEvent({ ctrlKey: true, shiftKey: true, altKey: true }))).toBe(
      false,
    );
  });

  it("다른 키는 거부", () => {
    expect(isAutofillHotkey(makeKeyEvent({ key: "K", ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("installTrigger — focus", () => {
  let dom: JSDOM;
  let doc: Document;
  let form: DetectedForm;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      url: "https://example.com/",
    });
    doc = dom.window.document;
    form = makeForm(doc);
  });

  it("password input focus 시 onTrigger 호출 (source=focus)", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    form.passwordInput.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));

    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe("focus");
    expect(events[0]!.input).toBe(form.passwordInput);
    expect(events[0]!.detectedForm).toBe(form);
    trigger.stop();
  });

  it("username input focus 도 onTrigger 호출", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    form.usernameInput!.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));

    expect(events).toHaveLength(1);
    expect(events[0]!.input).toBe(form.usernameInput);
    trigger.stop();
  });

  it("외부 input (form 미포함) focus 시 onTrigger ❌", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    const otherInput = doc.createElement("input");
    otherInput.type = "text";
    doc.body.appendChild(otherInput);
    otherInput.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));

    expect(events).toEqual([]);
    trigger.stop();
  });

  it("focus disabled 시 미발화", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      enabled: ["hotkey"],
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    form.passwordInput.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));

    expect(events).toEqual([]);
    trigger.stop();
  });
});

describe("installTrigger — hotkey", () => {
  let dom: JSDOM;
  let doc: Document;
  let form: DetectedForm;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      url: "https://example.com/",
    });
    doc = dom.window.document;
    form = makeForm(doc);
  });

  it("Ctrl+Shift+L on focused password input → onTrigger (source=hotkey)", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      enabled: ["hotkey"],
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    form.passwordInput.focus();
    const ev = new dom.window.KeyboardEvent("keydown", {
      key: "L",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    dom.window.dispatchEvent(ev);

    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe("hotkey");
    expect(events[0]!.input).toBe(form.passwordInput);
    trigger.stop();
  });

  it("active element 가 input 이 아니면 onTrigger ❌", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    doc.body.focus(); // body 는 input ❌.
    const ev = new dom.window.KeyboardEvent("keydown", {
      key: "L",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    dom.window.dispatchEvent(ev);

    expect(events).toEqual([]);
    trigger.stop();
  });

  it("hotkey 가 아닌 키는 ignore", () => {
    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      enabled: ["hotkey"],
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });

    form.passwordInput.focus();
    const ev = new dom.window.KeyboardEvent("keydown", {
      key: "A",
      ctrlKey: true,
      bubbles: true,
    });
    dom.window.dispatchEvent(ev);

    expect(events).toEqual([]);
    trigger.stop();
  });
});

describe("installTrigger — stop()", () => {
  it("stop 후 focus / hotkey 모두 미발화", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      url: "https://example.com/",
    });
    const doc = dom.window.document;
    const form = makeForm(doc);

    const events: TriggerEvent[] = [];
    const trigger = installTrigger(doc, {
      onTrigger: (e) => events.push(e),
      getForms: () => [form],
    });
    trigger.stop();

    form.passwordInput.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    form.passwordInput.focus();
    dom.window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "L",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(events).toEqual([]);
  });
});
