# Contributing to Volcano Agent SDK

Please take a moment to review this document in order to make the contribution process easy and effective for everyone involved.

## Using the issue tracker

[GitHub Issues](https://github.com/Kong/volcano-agent-sdk/issues) is the preferred channel for [bug reports](#bug-reports), [features requests](#feature-requests) and [submitting pull requests](#pull-requests).

Please respect the following restrictions:

- Please **do not** derail or troll issues. Keep the discussion on topic and respect the opinions of others.

## Bug Reports

A bug is a _demonstrable problem_ that is caused by the code in the repository. Good bug reports are extremely helpful - thank you!

Guidelines for bug reports:

1. **Use the GitHub issue search** &mdash; check if the issue has already been reported.
1. **Check if the issue has been fixed** &mdash; try to reproduce it using the latest `main` or development branch in the repository.
1. **Demonstrate the problem** &mdash; provide clear steps that can be reproduced.

A good bug report should not leave others needing to chase you up for more information. Please try to be as detailed as possible in your report. What is your environment? What steps will reproduce the issue? What Node.js version are you using? What would you expect to be the outcome? All these details will help to fix any potential bugs.

## Feature Requests

If you're comfortable implementing the idea yourself, **we strongly encourage opening a pull request (PR) rather than just a feature request.** Even a draft or partial implementation helps start a concrete discussion and speeds up review and decision-making. Proposals backed by working code are much more likely to be accepted and refined collaboratively.

You can also use [GitHub Discussions](https://github.com/Kong/volcano-agent-sdk/discussions) to discuss ideas and ask questions before submitting a formal feature request.

## Pull Requests

Good pull requests (patches, improvements, new features) are a fantastic help. They should remain focused in scope and avoid containing unrelated commits.

**Please ask first** before embarking on any significant pull request (e.g. implementing features, refactoring code), otherwise, you risk spending a lot of time working on something that might not get accepted into the project.

### Development Setup

1. Fork and clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Make your changes
4. Run tests:

   ```bash
   npm test
   ```

5. Run the linter:

   ```bash
   npm run lint
   ```

6. Build the project:

   ```bash
   npm run build
   ```

### Requirements

- Node.js 18.17 or higher
- TypeScript knowledge for contributing to the SDK

### Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages:

- `feat:` - New feature (correlates with MINOR version bump)
- `fix:` - Bug fix (correlates with PATCH version bump)
- `docs:` - Documentation only changes
- `style:` - Formatting changes (no code changes)
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks (deps, build, configs)
- `BREAKING CHANGE:` - Breaking changes (correlates with MAJOR version bump) or append ! to the commit type. e.g. `feat!:`

Examples:

- `feat(agent): add parallel execution support`
- `fix(mcp): resolve connection pooling issue`
- `docs(readme): update installation instructions`

**IMPORTANT**: By submitting a patch, you agree to allow the project owner to license your work under the Apache 2.0 license as used by the project.

## Questions?

If you have questions or need help, please:

- Check the [documentation](https://volcano.dev/docs)
- Open a [discussion](https://github.com/Kong/volcano-agent-sdk/discussions)
- File an [issue](https://github.com/Kong/volcano-agent-sdk/issues) if you've found a bug
