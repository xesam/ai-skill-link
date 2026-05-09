# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-09

### Fixed
- `--list` now displays skills from all configured repos by default instead of only the default repo
- `--all` now processes skills from all configured repos by default instead of only the default repo
- Manual skill specification now automatically searches across all repos instead of only the default repo
- Duplicate skill names across repos are now properly deduplicated (first match wins)
- Improved error message when specified repo directory does not exist

### Changed
- `--list` behavior: without `--repo`, shows all repos with section headers; with `--repo <name>`, shows only that repo
- `--all` behavior: without `--repo`, processes all repos; with `--repo <name>`, processes only that repo
- Manual skill specification: without `--repo`, searches all repos; with `--repo <name>`, searches only that repo
- All operations now respect the multi-repository design consistently

### Added
- `find_skill_path()` function to locate skills across all configured repositories
- Automatic deduplication when collecting skills from multiple repositories
- Repository directory existence validation with clear error messages
- Bash 3.x compatibility (macOS default version)

## [0.1.0] - 2026-04-27

### Added
- Initial release with basic skill linking functionality
- Support for multiple AI CLI tools (Claude Code, Codex, Gemini, Qwen Code)
- `--cli all` option to target all configured CLIs
- Named repository configuration via `[repo]` section
- Configuration override via `skill-link.local.conf`
- Cross-platform support (Bash, PowerShell, Batch)
- `--list`, `--all`, `--force`, `--dry-run`, `--relative`, `--unlink` options
- Example skill for tool introduction
