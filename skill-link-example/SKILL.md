# skill-link

skill-link 是一个跨平台的 AI Skills 链接管理工具，将集中维护的 skill 目录通过软链接分发到各 AI CLI 工具的 skills 目录，避免重复拷贝。

## 核心概念

- **Skill 仓库**：存放 skill 目录的中央仓库，每个 skill 是一个包含 `SKILL.md` 的目录
- **软链接分发**：在各 AI CLI 的 skills 目录中创建指向仓库的符号链接，改一处处处更新
- **配置驱动**：支持的 CLI 工具由 `skill-link.conf`（默认）和 `skill-link.local.conf`（用户自定义）定义

## 常用命令

```bash
# 链接单个 skill 到指定工具
./skill-link <skill-name> --cli <cli-name>

# 链接全部 skill 到指定工具
./skill-link --all --cli <cli-name>

# 链接到所有已配置的工具
./skill-link --all --cli all

# 删除已链接的 skill
./skill-link <skill-name> --cli <cli-name> --unlink

# 预览操作而不实际执行
./skill-link --all --cli all --dry-run

# 查看已配置的工具列表
./skill-link --list-clis

# 查看仓库中的 skill 列表
./skill-link --list
```

## 主要参数

| 参数 | 说明 |
|------|------|
| `--cli <name>` | 目标工具名称，`all` 表示所有已配置工具 |
| `--all` / `-a` | 操作仓库内全部 skill |
| `--unlink` / `-u` | 删除软链接而非创建 |
| `--dry-run` / `-n` | 预览模式，不实际修改文件 |
| `--force` / `-f` | 目标已存在时强制覆盖 |
| `--repo <dir>` | 指定 skill 仓库目录（默认为脚本所在目录） |

## 配置自定义工具

在脚本同级目录创建 `skill-link.local.conf`（已被 gitignore，不会提交）：

```ini
[clis]
cursor  = ~/.cursor/skills
my-tool = ~/path/to/my-tool/skills
```

与 `skill-link.conf` 中同名条目合并，`local.conf` 优先级更高。

## 支持的平台

- **macOS / Linux**：使用 `skill-link`（Bash 脚本）
- **Windows**：使用 `skill-link.bat`（推荐）或 `skill-link.ps1`（PowerShell）
