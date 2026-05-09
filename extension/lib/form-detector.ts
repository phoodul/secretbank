// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/form-detector.ts — M24-E Phase C-1
//
// 페이지 내 password / username input 을 우선순위로 감지한다.
// 우선순위:
//   1. <input autocomplete="current-password">
//   2. <input autocomplete="new-password">
//   3. <input type="password">
//   4. name/id regex (/password|pwd|passwd/i)
//
// 이 파일은 Light DOM 의 1회 scan 만 처리한다:
//   - Shadow DOM (open / closed) 처리는 C-3 에서.
//   - MutationObserver / SPA 동적 렌더링은 C-2 에서.
//   - iframe / cross-origin 처리는 C-7 에서.

/** password input 이 어떤 시그널로 감지되었는지. 우선순위 결정용. */
export type PasswordPriority = "current-password" | "new-password" | "type-password" | "name-regex";

/** username input 이 어떤 시그널로 감지되었는지. password 가 detect 된 form 안에서만 시도. */
export type UsernamePriority = "autocomplete" | "type-email" | "name-regex";

export interface DetectedForm {
  /** 가장 가까운 form 요소 (없으면 null = floating inputs). */
  formEl: HTMLFormElement | null;
  /** 감지된 password input. */
  passwordInput: HTMLInputElement;
  /** password 가 어떤 시그널로 감지되었는지 (우선순위). */
  passwordPriority: PasswordPriority;
  /** 같은 form 의 username 후보 (없으면 null). */
  usernameInput: HTMLInputElement | null;
  /** username 시그널 (없으면 null). */
  usernamePriority: UsernamePriority | null;
}

const PASSWORD_NAME_RE = /password|pwd|passwd/i;
const USERNAME_NAME_RE = /user|email|login|account/i;

/**
 * `root` 의 모든 password input 을 우선순위에 따라 감지한다.
 *
 * @param root  scan 시작 요소 (default = `document`).
 *              Shadow DOM 은 미지원 (C-3 에서).
 */
export function detectForms(
  root: Document | HTMLElement = typeof document !== "undefined"
    ? document
    : (undefined as unknown as Document),
): DetectedForm[] {
  if (!root) return [];

  // 모든 input 후보 수집 — light DOM 만.
  const allInputs = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];

  const detected: DetectedForm[] = [];
  const seen = new Set<HTMLInputElement>();

  for (const input of allInputs) {
    if (seen.has(input)) continue;

    const priority = classifyPassword(input);
    if (!priority) continue;
    seen.add(input);

    const formEl = input.closest("form") as HTMLFormElement | null;
    const usernameMatch = findUsernameNear(formEl, root, allInputs, seen);

    detected.push({
      formEl,
      passwordInput: input,
      passwordPriority: priority,
      usernameInput: usernameMatch?.input ?? null,
      usernamePriority: usernameMatch?.priority ?? null,
    });

    if (usernameMatch) {
      seen.add(usernameMatch.input);
    }
  }

  return detected;
}

/**
 * input 이 password 인지 판별 + 우선순위.
 * autocomplete 우선, type=password fallback, name/id regex 마지막.
 */
function classifyPassword(input: HTMLInputElement): PasswordPriority | null {
  const ac = (input.getAttribute("autocomplete") ?? "").toLowerCase().trim();

  if (ac === "current-password") return "current-password";
  if (ac === "new-password") return "new-password";

  if (input.type === "password") return "type-password";

  // type 이 password 가 아니지만 name/id 가 password 패턴 — phishing 또는 비표준 사이트.
  // type="text" + name="password" 같은 경우 (보안상 의심스러우나 detect 자체는 가능).
  if (PASSWORD_NAME_RE.test(input.name) || PASSWORD_NAME_RE.test(input.id)) {
    return "name-regex";
  }

  return null;
}

interface UsernameMatch {
  input: HTMLInputElement;
  priority: UsernamePriority;
}

/**
 * password input 의 form 안에서 username 후보 탐색.
 * formEl 이 null 이면 root 의 모든 input 중에서.
 *
 * 우선순위:
 *   1. autocomplete=username | autocomplete=email
 *   2. type=email
 *   3. name regex (/user|email|login|account/i)
 */
function findUsernameNear(
  formEl: HTMLFormElement | null,
  root: Document | HTMLElement,
  allInputs: HTMLInputElement[],
  seen: Set<HTMLInputElement>,
): UsernameMatch | null {
  const candidates: HTMLInputElement[] = formEl
    ? (Array.from(formEl.querySelectorAll("input")) as HTMLInputElement[])
    : allInputs;

  // 우선순위별 후보 분류.
  let acMatch: HTMLInputElement | null = null;
  let emailMatch: HTMLInputElement | null = null;
  let regexMatch: HTMLInputElement | null = null;

  for (const c of candidates) {
    if (seen.has(c)) continue;
    if (c.type === "password") continue;

    const ac = (c.getAttribute("autocomplete") ?? "").toLowerCase().trim();
    if (!acMatch && (ac === "username" || ac === "email")) {
      acMatch = c;
      continue;
    }
    if (!emailMatch && c.type === "email") {
      emailMatch = c;
      continue;
    }
    if (!regexMatch && (USERNAME_NAME_RE.test(c.name) || USERNAME_NAME_RE.test(c.id))) {
      regexMatch = c;
    }
  }

  if (acMatch) return { input: acMatch, priority: "autocomplete" };
  if (emailMatch) return { input: emailMatch, priority: "type-email" };
  if (regexMatch) return { input: regexMatch, priority: "name-regex" };
  return null;
}
