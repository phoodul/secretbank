---
description: Stage changes and create a conventional commit with scope
---

1. Check current changes with `git status` and `git diff`.
2. Determine scope: backend (Rust), ui (frontend), or tauri (config).
3. Stage only relevant files.
   // turbo
4. Run `git add <files>`
5. Write a commit message: `<type>(<scope>): <Korean description>`.
   // turbo
6. Run `git commit -m "<type>(<scope>): <Korean description>"`
