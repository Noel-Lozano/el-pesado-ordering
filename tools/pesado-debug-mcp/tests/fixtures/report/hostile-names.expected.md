### 🔴 CI failed: 2 failing tests

| Suite | Passed | Failed | Skipped | Pass rate |
|---|---|---|---|---|
| backend (unit) | 0 | 2 | 0 | 0% |

**Failing tests**

<details>
<summary><code>backend/src/test/unit/lib/evil.test.ts</code>: &lt;script&gt;alert(1)&lt;/script&gt; &#124; breaks &#124; the table: &#42;&#42;bold&#42;&#42; &#95;it&#95; &#91;link&#93;(http://evil.example) &#96;code&#96; &lt;/details&gt;</summary>

`````text
**bold** _it_ [link](http://evil.example) `code` </details>
```
closing fence attempt
````

backend/src/test/unit/lib/evil.test.ts:3:1
`````

</details>

<details>
<summary><code>backend/src/test/unit/lib/evil.test.ts</code>: back&#92;slash &#96; tick &#96;&#96;&#96; fence: plain failure</summary>

```text
plain failure
```

</details>
