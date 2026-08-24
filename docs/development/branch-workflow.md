# Branch and release workflow

## Branch roles

- `main`: production source. Changes arrive through a pull request from `develop` or `hotfix/*`.
- `develop`: integration and staging source. Changes arrive through pull requests from topic branches.
- `feat/*`: user-facing feature work.
- `fix/*`: defect fixes.
- `chore/*`: tooling, documentation, and maintenance work.
- `hotfix/*`: urgent production fixes branched from `main`.

## Normal change

1. Create a topic branch from the latest `develop`.
2. Open a draft pull request targeting `develop` early when useful.
3. Complete the PR template and move the PR out of draft.
4. Resolve CI failures and actionable CodeRabbit findings.
5. Squash merge the topic branch into `develop`.
6. Verify the `develop` staging deployment.

## Production release

1. Update `package.json` to the intended semantic version on `develop`.
2. Add release notes or a changelog entry.
3. Open a pull request from `develop` to `main` titled `release: vX.Y.Z`.
4. Verify CI, CodeRabbit, and the staging deployment.
5. Merge with a merge commit so the long-lived branches keep shared ancestry.
6. The `main` push creates the Git tag, GitHub Release, service notification, and production deployment.

Do not squash or rebase the `develop` to `main` release pull request. Doing so causes
the histories of the two long-lived branches to diverge.

## Hotfix

1. Create `hotfix/*` from `main`.
2. Open a pull request to `main` and complete all required checks.
3. After production verification, merge `main` back into `develop` immediately.

## Version policy

- Ordinary commits and topic PR titles do not contain a version.
- Only a production release PR changes the package version.
- A version already present as a Git tag cannot be released again.
