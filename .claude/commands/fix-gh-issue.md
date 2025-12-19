Please analyze the github isue and make a plan: $ARGUMENTS.

## Github rules
- You MUST make frequent commits with good boundaries. Don't wait until the end to commit!
- Use 'gh' for all github-related tasks
  - for example `gh issue view <issue_number> --json body,comments,title`
  - NEVER specify the repo, gh is already configured locally for the working dir

## Steps

1. Review the github issue and comments
2. Create a new branch '(fix|feat|docs)/<issue-number>-<one-phrase description>
  - unless you are alrady on a branch
3. Fnd relevant methods, classes, files, and tests
4. Make a plan
5. Ask the user to approve the plan
6. Implement the plan
7. Verify tests pass. Branches are almost always started from a clean HEAD on main
8. Use the pre-commit hooks for linting and type checking
