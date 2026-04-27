# AI Skill Link

[中文文档](README.zh-CN.md)

A unified AI skill configuration repository for centrally managing skills across various AI CLI tools, avoiding duplicate copies.

## Project Goals

Many AI CLI tools have their own skills configuration systems. To avoid repeatedly copying the same skill files across projects, this project provides a unified skill repository. AI CLI tools can reference needed skills via symbolic links.

**Key Benefits:**

- **Centralized Management**: All skills in one repository for easy maintenance and updates
- **Avoid Duplication**: No need to copy the same skill files across AI CLI projects
- **Version Consistency**: Ensures all AI CLIs use the same version of skills
- **Space Saving**: Symbolic links avoid duplicate storage across projects

## Project Structure

```
ai-skill-link/
├── skill-link-example/       # Example skill: introduces tool usage
│   └── SKILL.md              # Skill definition file
├── skill-link                # Bash script (macOS/Linux)
├── skill-link.ps1            # PowerShell script (Windows)
├── skill-link.bat            # Batch file (Windows, recommended for regular users)
├── skill-link.conf           # Default CLI configuration (committed to repo)
└── README.md                 # This file
```

Each skill is a directory containing `SKILL.md`, optionally with `agents/`, `references/` subdirectories:

```
your-skill-name/
├── SKILL.md              # Required: skill definition file
├── agents/               # Optional: AI agent configurations
└── references/           # Optional: reference documentation
```

## Usage

### Quick Start

```bash
# List available skills in repository
./skill-link --list

# Link all skills to all configured tools
./skill-link --all --cli all

# Link a single skill to a specific tool
./skill-link skill-link-example --cli claude-code
```

### macOS / Linux (Bash)

Command format:

```bash
./skill-link <skill_name...> --cli <name> [options]
./skill-link --all --cli <name> [options]
```

Common examples:

```bash
# List available skills
./skill-link --list

# List configured AI CLI tools
./skill-link --list-clis

# Link a single skill to a specific tool
./skill-link skill-link-example --cli claude-code

# Link a single skill to all tools
./skill-link skill-link-example --cli all

# Link all skills to all tools (dry-run)
./skill-link --all --cli all --dry-run

# Link all skills to all tools (execute)
./skill-link --all --cli all

# Force overwrite existing targets
./skill-link skill-link-example --cli claude-code --force

# Remove linked skills
./skill-link skill-link-example --cli claude-code --unlink

# Remove all linked skills (all tools)
./skill-link --all --cli all --unlink

# Create relative symlinks
./skill-link skill-link-example --cli claude-code --relative
```

### Windows (Recommended - Batch File)

For regular users, use `skill-link.bat` directly without configuring PowerShell execution policy.

**Steps:**

1. Open Command Prompt (press `Win + R`, type `cmd`, press Enter)
2. Navigate to repository directory:
   ```cmd
   cd e:\work-repos\ai-skill-link
   ```
3. Run commands:
   ```cmd
   skill-link.bat --list
   skill-link.bat --all --cli all --dry-run
   skill-link.bat --all --cli all
   ```

Common commands:

```cmd
skill-link.bat --list
skill-link.bat --list-clis
skill-link.bat skill-link-example --cli claude-code
skill-link.bat skill-link-example --cli all
skill-link.bat --all --cli all --dry-run
skill-link.bat --all --cli all
skill-link.bat skill-link-example --cli claude-code --unlink
skill-link.bat --all --cli all --unlink
skill-link.bat skill-link-example --cli claude-code --force
```

**Permission Requirements:**

Creating symbolic links on Windows requires one of:

1. **Run Command Prompt as Administrator** (recommended for temporary use)
   - Right-click "Command Prompt" → "Run as administrator"

2. **Enable Developer Mode** (recommended for long-term development)
   - Settings → Update & Security → Developer Options → Enable "Developer Mode"

**Note:** If you see error `You do not have sufficient privilege to perform this operation`, you need one of the above.

### Windows (PowerShell - Advanced Users)

Temporarily bypass execution policy:

```powershell
powershell -ExecutionPolicy Bypass -File .\skill-link.ps1 --list
powershell -ExecutionPolicy Bypass -File .\skill-link.ps1 --all --cli all
```

Or permanently modify current user execution policy (requires admin rights) then use directly:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\skill-link.ps1 --all --cli all
```

### Parameters

| Parameter | Short | Description |
|-----------|-------|-------------|
| `--cli <name>` | `-c` | Target tool name (required), `all` for all configured tools |
| `--all` | `-a` | Operate on all skills in repository (mutually exclusive with explicit skill names) |
| `--unlink` | `-u` | Remove symlinks instead of creating them (only removes links pointing to this repo) |
| `--dry-run` | `-n` | Preview mode, don't actually modify files |
| `--force` | `-f` | Force overwrite if target exists |
| `--relative` | | Create relative path symlinks |
| `--repo <name-or-path>` | `-r` | Specify skill repository (named repo or path) |
| `--list` | `-l` | List available skills in repository |
| `--list-clis` | | List configured CLI tools and their directories |
| `--help` | `-h` | Show help information |

### Configuration

Configuration files are layered:

| File | Description |
|------|-------------|
| `skill-link.conf` | Default configuration committed to repo, includes common AI tools |
| `skill-link.local.conf` | User local configuration (gitignored), can add or override default entries |

Entries in `skill-link.local.conf` take precedence.

**Configuration Format:**

```ini
[repo]
default = ~/my-skills
work    = ~/work-skills
oss     = ~/opensource-skills

[clis]
cursor  = ~/.cursor/skills
my-tool = ~/path/to/my-tool/skills
```

**[repo] Configuration:**

Supports multiple named repos for organizing skills from different sources (personal, team, open-source, etc.):

- `default`: Special name, used when `--repo` parameter is not specified
- Other names: Custom named repos, referenced via `--repo <name>`
- Usage examples:
  - `./skill-link --list` → uses `default` repo
  - `./skill-link --list --repo work` → uses named repo `work`
  - `./skill-link --list --repo /tmp/test` → uses temporary path
- Priority: command-line `--repo` > config `[repo] default` > script directory

**[clis] Configuration:**

Defines AI CLI tools and their skills directory paths:

- `~` automatically expands to user home directory
- Run `--list-clis` to see current merged list
- `--cli all` operates on all configured CLI tools

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All successful |
| `1` | Parameter error (e.g., missing `--cli`) |
| `2` | Skill not found or no valid `SKILL.md` |
| `3` | Target conflict (exists and `--force` not used) |
| `4` | Other link failures |
