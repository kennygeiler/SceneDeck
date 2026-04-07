# Summary: Plan 03-02

**Phase:** 03-security-exposure  
**Completed:** 2026-04-07

## Outcomes

- `validateApiKey`: Bearer only unless `METROVISION_ALLOW_API_KEY_QUERY` is `true`/`1`/`yes`.
- `.planning/codebase/INTEGRATIONS.md`: integrator docs updated.

## Verification

- Grep v1 routes still use `validateApiKey`; error messages steer to Bearer.
