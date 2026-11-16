### 🔴 CI failed: 2 failing tests

| Suite | Passed | Failed | Skipped | Pass rate |
|---|---|---|---|---|
| backend (integration) | 1 | 2 | 1 | 33.3% |
| backend (unit) | 17 | 0 | 0 | 100% |
| frontend (unit) | 17 | 0 | 0 | 100% |

**Failing tests**

<details>
<summary><code>backend/src/test/unit/lib/broken.test.ts</code>: src/test/unit/lib/broken.test.ts: Error: Cannot find module &#x27;../../../lib/does-not-exist.js&#x27; imported from /home/runner/work/el-pesado-ordering/el-pesado-ordering/backend/src/test/unit/lib/broken.test.ts</summary>

```text
Error: Cannot find module '../../../lib/does-not-exist.js' imported from /home/runner/work/el-pesado-ordering/el-pesado-ordering/backend/src/test/unit/lib/broken.test.ts

Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

backend/src/test/unit/lib/broken.test.ts:1:1
```

</details>

<details>
<summary><code>backend/src/test/unit/lib/fixture.test.ts</code>: pricing fixture &gt; rejects items before 14:00: AssertionError: expected 4500 to be 400 // Object.is equality</summary>

```text
AssertionError: expected 4500 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 4500

backend/src/test/unit/lib/fixture.test.ts:9:87
```

</details>
