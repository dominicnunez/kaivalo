### Public API smoke test only re-checks component rendering already covered elsewhere

**Location:** `10`

**Reason:** This test does more than duplicate the direct component tests.
`packages/ui/index.test.ts` imports `Button`, `Badge`, `Card`, and `Container` from the package root `./index.ts`.
That means the public-API test uniquely verifies the package barrel exports and consumer import surface, which a plain build or direct component render does not fully cover.
