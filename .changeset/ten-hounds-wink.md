---
"@webmaster-droid/server": patch
---

Fix Supabase-first server imports and remove legacy AWS SDK v2 transitive install.

- server: make `streamHandler` lazy so importing `@webmaster-droid/server` no longer crashes outside AWS Lambda
- server: replace `aws-lambda` package type coupling with local API Gateway types
- server: remove runtime `aws-lambda` dependency to stop pulling `aws-sdk` v2 for Supabase-only installs
