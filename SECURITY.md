# Security policy

## Scope

M-E handles prototype data and, depending on configuration, may process accounts, uploaded files, location, event, or cadet information. Do not use it with production or sensitive data without a security review.

## Reporting

Please report suspected vulnerabilities privately through GitHub's private vulnerability reporting when enabled, or contact the repository maintainers privately. Do not publish credentials, personal data, or exploit details in a public issue.

## Baseline expectations

Use environment variables for secrets, rotate credentials that may have been exposed, validate uploads and request bodies, enforce authentication and authorization on administrative routes, restrict CORS, and use HTTPS in deployed environments.
