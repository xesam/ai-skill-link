# AI Skills

一个统一的AI技能配置仓库，用于集中管理各种AI CLI工具的skills配置，避免重复拷贝。

## 项目目标

许多AI CLI工具都有自己的skills配置系统，为了避免在每个项目中重复拷贝相同的skill文件，本项目提供了一个统一的技能仓库。各个AI CLI工具可以通过软链接（symbolic links）的方式引用它们需要的skill文件。

**主要优势：**

- **集中管理**：所有skills集中在一个仓库中，便于维护和更新
- **避免重复**：不需要在每个AI CLI项目中都拷贝相同的skill文件
- **版本一致**：确保所有AI CLI使用的是相同版本的skill
- **节省空间**：通过软链接引用，避免多个项目重复存储相同的文件

## 项目结构

```
ai-skills/
├── publish-android/          # 示例skill：Android发布配置
│   ├── SKILL.md             # 技能定义和说明
│   ├── agents/              # AI代理配置
│   │   └── openai.yaml      # OpenAI代理配置
│   └── references/          # 参考文档
│       └── release-checklist.md
├── skill-link               # Bash 脚本（macOS/Linux）
├── skill-link.ps1           # PowerShell 脚本（Windows）
├── skill-link.bat           # 批处理文件（Windows，推荐普通用户使用）
└── README.md                # 本文件
```

## 使用方法

### 0. 快速链接脚本（推荐）

仓库根目录提供跨平台的链接脚本：
- `skill-link` - Bash 脚本（macOS/Linux）
- `skill-link.bat` - 批处理文件（Windows，推荐普通用户使用）
- `skill-link.ps1` - PowerShell 脚本（Windows，高级用户使用）

这些脚本可根据 AI CLI 名称自动链接到对应 `skills` 目录。

#### macOS / Linux（Bash）

命令格式：

```bash
./skill-link <skill_name...> --cli <name> [options]
./skill-link --all --cli <name> [options]
```

```bash
# 查看可用 skill
./skill-link --list

# 查看支持的 AI CLI
./skill-link --list-clis

# 链接单个 skill 到 Codex
./skill-link publish-android --cli codex

# 链接单个 skill 到所有工具
./skill-link publish-android --cli all

# 链接全部 skill（预览模式）
./skill-link --all --cli codex --dry-run

# 强制覆盖已有同名目标
./skill-link publish-android --cli codex --force

# 删除已链接的 skill
./skill-link publish-android --cli codex --unlink

# 删除全部已链接的 skill
./skill-link --all --cli codex --unlink

# 创建相对软链接
./skill-link publish-android --cli codex --relative
```

#### Windows（推荐 - 使用批处理文件）

对于普通用户，直接使用 `skill-link.bat` 文件，无需配置 PowerShell 执行策略。

**使用步骤：**

1. 打开命令提示符（按 `Win + R`，输入 `cmd`，回车）
2. 进入本仓库目录：
   ```cmd
   cd e:\work-repos\ai-skills
   ```
3. 运行命令（示例）：
   ```cmd
   # 查看可用 skill
   skill-link.bat --list

   # 查看支持的 AI CLI
   skill-link.bat --list-clis

   # 先预览要链接的内容
   skill-link.bat publish-android --cli codex --dry-run

   # 实际执行链接
   skill-link.bat publish-android --cli codex
   ```

**常用命令：**

```cmd
# 链接单个 skill 到 Codex
skill-link.bat publish-android --cli codex

# 链接多个 skill
skill-link.bat skill1 skill2 --cli codex

# 链接全部 skill（预览模式）
skill-link.bat --all --cli codex --dry-run

# 链接全部 skill（实际执行）
skill-link.bat --all --cli codex

# 强制覆盖已有同名目标
skill-link.bat publish-android --cli codex --force

# 删除已链接的 skill
skill-link.bat publish-android --cli codex --unlink

# 删除全部已链接的 skill
skill-link.bat --all --cli codex --unlink

# 创建相对软链接（同盘符下有效）
skill-link.bat publish-android --cli codex --relative
```

**权限说明：**

Windows 上创建符号链接需要以下任一条件：

1. **以管理员身份运行命令提示符**（推荐临时使用）
   - 右键点击「命令提示符」→「以管理员身份运行」

2. **开启开发者模式**（推荐长期开发使用）
   - 设置 → 更新与安全 → 开发者选项 → 开启「开发者模式」
   - 开启后普通命令提示符也能创建符号链接

**提示：** 如果看到错误 `You do not have sufficient privilege to perform this operation`，说明需要上述权限之一。

#### Windows（PowerShell - 高级用户）

如果你更喜欢使用 PowerShell，可以运行以下命令临时绕过执行策略：

```powershell
# 查看可用 skill
powershell -ExecutionPolicy Bypass -File .\skill-link.ps1 --list

# 链接单个 skill 到 Codex
powershell -ExecutionPolicy Bypass -File .\skill-link.ps1 publish-android --cli codex
```

或者永久修改当前用户的执行策略（需要管理员权限）：

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

之后就可以直接使用：

```powershell
.\skill-link.ps1 --list
.\skill-link.ps1 publish-android --cli codex
```

#### 常用参数

- `--cli <name>`：目标 AI CLI 名称（必填，`all` 表示所有支持的工具）
- `--all`：链接仓库内所有 skill（与 `skill_name...` 互斥）
- `--unlink` / `-u`：删除软链接而非创建（仅删除指向本仓库的链接，`--force` 可强制删除其他链接）
- `--dry-run`：仅预览将执行的操作，不创建软链接
- `--force`：目标已存在时强制覆盖
- `--relative`：创建相对路径软链接
- `--list`：列出仓库中的可用 skill
- `--list-clis`：列出支持的 AI CLI 及其默认目录
- `--help`：查看完整帮助

### CLI 配置

支持的 CLI 由配置文件定义，分两层：

| 文件 | 说明 |
|------|------|
| `skill-link.conf` | 随仓库提交的默认配置，内置常用 AI 工具 |
| `skill-link.local.conf` | 用户本地配置（已 gitignore），可新增或覆盖默认条目 |

`skill-link.local.conf` 中同名条目优先级更高。

**格式示例：**

```ini
[clis]
my-tool = ~/.my-tool/skills
cursor  = ~/.cursor/skills
```

`~` 会自动展开为用户主目录。运行 `--list-clis` 查看当前合并后的完整列表。

返回码：

- `0`：全部成功
- `1`：参数错误（如缺少 `--cli`）
- `2`：skill 不存在或无有效 `SKILL.md`
- `3`：目标冲突（已存在且未使用 `--force`）
- `4`：其他链接失败

### 1. 添加新的Skill

在项目根目录下创建新的skill目录，结构如下：

```
your-skill-name/
├── SKILL.md              # 必需：技能定义文件
├── agents/               # 可选：AI代理配置目录
│   └── openai.yaml       # OpenAI代理配置
└── references/           # 可选：参考文档目录
    └── reference.md      # 相关参考文档
```

### 2. 在AI CLI项目中引用Skill

使用软链接的方式引用需要的skill：

```bash
# 假设AI CLI项目位于 ~/my-ai-cli-project
cd ~/my-ai-cli-project/skills

# 创建软链接到ai-skills仓库中的skill
ln -s /Users/edy/ai-skills/publish-android ./publish-android
```

### 3. 验证软链接

```bash
# 查看软链接是否正确创建
ls -la

# 应该显示类似：
# publish-android -> /Users/edy/ai-skills/publish-android
```
