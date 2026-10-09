# Installed APK identity (Seeker)

Do not treat missing `submission/*.apk` in the reconstruct workspace as a reason to reinstall.

| Field | Value |
|-------|--------|
| Package | `com.sudoku.game` |
| versionName | `0.1.0` |
| versionCode | `1` |
| Release URL (shell) | `https://soldoku.com/` |
| Pulled device base.apk SHA-256 | `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c` |
| Recovered release APK (preserved, do not overwrite) | `C:\Users\J\soldoku-recovery-2026-10-08\evidence-original\soldoku-clockin.apk` |
| Recovered APK SHA-256 | `bf4276273dc43f1609c464171180676dbf0f933c3da79f767eede8fb352a200c` (match) |
| Hosted web release under test | `f4619a4d194ca03eef84df04080df38c7d6bad25` via `/api/release` |

The APK identity and the hosted Worker asset set are distinct. Merging `main` does not change what the phone loads until a separate public deploy.

Repository `submission/` may lack a binary copy; that is an artifact-location issue only. Original recovery copy stays outside the git working tree and is not replaced.
