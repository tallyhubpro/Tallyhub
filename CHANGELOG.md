# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog (https://keepachangelog.com/en/1.1.0/) and this project adheres to Semantic Versioning (https://semver.org/).

## [1.1.0] - 2025-10-05
### Added
- Structured logging system (`src/core/logger.ts`) with log levels controlled by `LOG_LEVEL`.
- ATEM mixer integration scaffolding (`ATEMConnector`) and integration summary docs.
- New firmware binaries directory for `M5Stick_Tally_Plus2` devices.
- Project contribution guidelines (`CONTRIBUTING.md`).
- Elementor schedule template (`elementor/church-programs-template.json`).
- Log pruning maintenance script (`scripts/clean-logs.js`).
- Additional documentation: firmware improvements, WiFi scanning, unique naming summaries.

### Changed
- Replaced ad-hoc `console.log` usage with centralized logger across core and platform server code (Mac & Windows).
- Updated `package.json` scripts for linting, formatting, type checking, production start, and log pruning.
- Enhanced `README.md` with production run instructions and deployment guidance.

### Removed
- Deprecated `/api/test/status` debug endpoint from all server variants.
- Legacy test and experimental scripts in root, Mac, and Windows server directories.

### Security / Hardening
- Reduced attack surface by eliminating debug routes and test scripts from production build context.
- Enforced Node.js >= 18 via `engines` field.

## [1.0.1] - 2025-09-??
### Notes
- Initial public hardening baseline before structured logging and production cleanup.

