---
"agents": patch
---

Fix `onError` type safety: use rest parameter tuple to distinguish overloads instead of checking truthiness of arguments. The previous implementation used `connectionOrError && error` to detect whether the two-argument (connection, error) or single-argument (error) overload was called. This failed for falsy error values (e.g., `null`, `0`, `""`), incorrectly routing them as server errors. Now uses `rest.length` to reliably distinguish the overload variant.
