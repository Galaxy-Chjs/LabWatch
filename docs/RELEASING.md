# Releasing LabWatch · 发布指南

Everything that has to be done by a human, in order. The code side is finished;
what remains needs your accounts and credentials.

所有必须由你本人完成的步骤，按顺序排列。代码侧已经完成，剩下的都需要你的账号与凭据。

- [Part 1 · GitHub](#part-1--github)
- [Part 2 · Publish to PyPI so `uvx labwatch-lite` works](#part-2--publish-to-pypi--发布到-pypi)
- [Part 3 · VS Code extension](#part-3--vs-code-extension--vs-code-扩展)
- [Part 4 · After the first release](#part-4--after-the-first-release--首次发布之后)
- [Part 5 · Optional polish](#part-5--optional-polish--可选的收尾)

---

## Part 1 · GitHub

**Status: done.** `main` and the three tags are pushed; CI is green.

**状态：已完成。** `main` 与三个标签都已推送，CI 全绿。

| Item | Value |
|---|---|
| Repository | <https://github.com/Galaxy-Chjs/LabWatch> |
| Branch | `main` |
| Tracked files | 174 |
| Tags pushed | `v1.0.0`, `v1.0.1`, `v1.1.0` (all three point at `9bfbe93`) |
| CI | 6/6 jobs green on `3231ee4` |
| Push credentials | Windows Credential Manager (HTTPS) — nothing to do |

### The name you type is not the name you publish · 输入的名字 ≠ 发布的名字

| Thing | Value |
|---|---|
| PyPI **distribution** name | `labwatch-lite` |
| PyPI **username** (yours) | `galaxy-chjs` |
| Import package | `labwatch` |
| Console command | `labwatch` |
| GitHub repo | `Galaxy-Chjs/LabWatch` |

PyPI is a flat namespace with no owner prefix, and the name `labwatch` there already
belongs to an unrelated project ([rbretschneider/labwatch_cli](https://github.com/rbretschneider/labwatch_cli),
49 releases). Publishing under `labwatch` is therefore impossible, and *installing*
plain `labwatch` would silently give a user someone else's tool. So the distribution
is `labwatch-lite` while the command and import package stay `labwatch`:
`uvx labwatch-lite` installs a command called `labwatch`.

PyPI 是扁平命名空间，没有「所有者前缀」，而 `labwatch` 这个名字已被另一个无关项目占用
（[rbretschneider/labwatch_cli](https://github.com/rbretschneider/labwatch_cli)，49 个版本）。
因此**不能**用 `labwatch` 发布，而且用户若直接 `pip install labwatch`，装到的是别人的工具。
所以发行名用 `labwatch-lite`，命令与导入包名保持 `labwatch`：`uvx labwatch-lite` 装出来的
命令仍叫 `labwatch`。

> **Correction to an earlier version of this document.** I first checked only whether
> the *GitHub* name `labwatch` was free and wrote here that "`labwatch` on PyPI is not
> yet taken". That was wrong: I had not queried the PyPI index. The collision above is
> the reason for the `labwatch-lite` name. · 本文档早期版本只查了 GitHub 上 `labwatch`
> 是否被占用，就写下「PyPI 上 `labwatch` 还没被占用」。这是错的：我没有查 PyPI 索引。
> 上面这个名字冲突就是改用 `labwatch-lite` 的原因。

---

## Part 2 · Publish to PyPI · 发布到 PyPI

**Status: done.** `labwatch-lite 1.1.0` is live —
<https://pypi.org/project/labwatch-lite/> — published by the Release workflow
through Trusted Publishing, with a successful manual dry run beforehand. The
steps below are kept as the record of how it was set up, and as the procedure if
the account or publisher ever has to be recreated.

**状态：已完成。** `labwatch-lite 1.1.0` 已发布
（<https://pypi.org/project/labwatch-lite/>），由 Release 工作流通过可信发布完成，
事前还成功跑过一次手动演练。下面的步骤作为配置记录保留，也用于账号或发布者需要重建时。

```bash
uvx labwatch-lite --version     # labwatch 1.1.0
```

### Step 1 · Create the account · 注册账号

1. <https://pypi.org/account/register/> — the real index.
2. Username: **`galaxy-chjs`** (this is what you decided on).

   The username appears on the project page and in upload logs, but **not** in any
   `pip install` command — that is the distribution name, which is `labwatch-lite`.
   So the username is safe to reuse across all six portfolio projects.

   用户名只出现在项目页与上传日志里，**不会**出现在任何 `pip install` 命令中——命令里用的是
   发行名 `labwatch-lite`。所以这个用户名可以在六个作品里通用。

3. <https://test.pypi.org/account/register/> — optional rehearsal index, same username.

### Step 2 · Enable 2FA · 开启两步验证

PyPI requires it for publishing. TOTP app or security key, under
<https://pypi.org/manage/account/>. Recovery codes: save them somewhere real.
PyPI 强制要求两步验证才能发布；恢复码请妥善保存。

### Step 3 · Configure Trusted Publishing (no token needed) · 配置可信发布

The repository already has `.github/workflows/release.yml`, which publishes with
OIDC — there is no API token to create or leak.

1. <https://pypi.org/manage/account/publishing/> → **Add a new pending publisher**
2. Fill in exactly (every field is case-sensitive):

   | Field | Value |
   |---|---|
   | PyPI Project Name | `labwatch-lite` |
   | Owner | `Galaxy-Chjs` |
   | Repository name | `LabWatch` |
   | Workflow name | `release.yml` |
   | Environment name | *(leave empty)* |

3. Save. The publisher stays "pending" until the first successful upload, then
   becomes active. 首次成功上传后，pending 状态会自动转为激活。

> Prefer a token instead? Create one at
> <https://pypi.org/manage/account/token/> (scope: project `labwatch-lite`), add it as
> the repository secret `PYPI_API_TOKEN`, and replace the `pypa/gh-action-pypi-publish`
> step's `with:` block with `password: ${{ secrets.PYPI_API_TOKEN }}`. Trusted
> Publishing is better because nothing long-lived is stored.

### Step 4 · Release · 执行发布

A version is released by pushing a tag. The workflow fails early unless the tag, the
`pyproject.toml` version and `labwatch/__init__.py` all agree.

### Before the first upload: the tag must contain the final `pyproject.toml`

`v1.1.0` points at commit `9bfbe93`. The `labwatch-lite` distribution name was
changed **after** that commit, so if the workflow for `v1.1.0` runs it will build a
wheel named `labwatch-1.1.0-...whl` for the project `labwatch` — which is exactly the
name that must not be published. **Move the tag onto current `main` first:**

在首次上传前：`v1.1.0` 目前指向 `9bfbe93`，而 `labwatch-lite` 这个发行名是在那之后才改的。
若不处理，`v1.1.0` 的工作流会构建出名为 `labwatch-1.1.0-*.whl`、项目名为 `labwatch`
的包——正是不能发布的名字。**先把标签移到当前 `main`：**

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite
git pull origin main                             # make sure you are on the latest main
git push origin :refs/tags/v1.1.0                # delete the old remote tag
git tag -f -a v1.1.0 -m "LabWatch v1.1.0" HEAD   # re-tag the current main
git push origin v1.1.0                           # push the moved tag -> triggers Release
```

Tag the tip of `main`, not the older commit: it has to contain the
`labwatch-lite` name and the README fixes. · 标签要打在 `main` 的最新提交上，而不是旧提交：
它必须包含 `labwatch-lite` 这个名字与 README 的修正。

(Deleting and re-pushing a tag on a personal repository whose release nobody has
consumed yet is harmless; it is only rude once others depend on it. · 个人仓库、发布还没
被任何人使用，改标签无害；只有在别人已经依赖它之后才不该改。)

**Dry run first (recommended).** In the Actions tab, run **Release** manually with
`dry_run = true`: it builds, installs into a clean environment, serves the dashboard,
and runs `twine check`, without uploading. Then do the real thing above.

### Step 5 · Verify · 验证

Wait about a minute after the upload, then:

```bash
uvx labwatch-lite --version
uvx labwatch-lite doctor
```

or

```bash
pipx install labwatch-lite && labwatch doctor
```

Also check that <https://pypi.org/project/labwatch-lite/> renders the README and that
the console command really is `labwatch` (not `labwatch-lite`).

### Step 6 · Add the badges · 加徽章

Once it is live, add to the top of `README.md` (and `README.zh-CN.md`):

```markdown
[![PyPI](https://img.shields.io/pypi/v/labwatch-lite)](https://pypi.org/project/labwatch-lite/)
![PyPI - Python Version](https://img.shields.io/pypi/pyversions/labwatch-lite)
```

I left these out on purpose: a version badge pointing at a 404 looks worse than no
badge. Tell me and I will make the edit. · 徽章我故意没加：指向 404 的版本徽章比没有更糟。
发布成功后告诉我，我来改。

### Future versions · 后续版本

1. Change the version in **two** places: `pyproject.toml` and
   `labwatch/__init__.py`. The release workflow fails if they disagree with the tag.
2. Update `docs/PROJECT_REPORT.html` and `docs/ACCEPTANCE.md`.
3. `git commit`, then `git tag -a v1.1.1 -m "..."`, then `git push origin v1.1.1`.

**You cannot reuse a version number on PyPI.** A failed upload does not consume
it, but a successful one is permanent, so a broken release is fixed by publishing
`v1.1.1`, never by re-uploading `v1.1.0`.

---

## Part 3 · VS Code extension · VS Code 扩展

The extension is built, tested (13 unit tests) and packages cleanly. Installing it
on your own machine is already possible; giving it to others needs a Marketplace
publisher.

扩展已完成、测试通过（13 个单测）、打包正常。"自己用"现在就能装；"给别人用"需要
Marketplace 发布者账号。

### Right now: install it for yourself · 现在就能自己安装

Installed on this machine as `galaxy-chjs.labwatch-gpu-status@1.2.0`. To reinstall
after a change:

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension
npm install
npm run compile
npx --yes @vscode/vsce package --no-dependencies
code --install-extension labwatch-gpu-status-1.3.3.vsix --force
```

Then reload the VS Code window: `Ctrl+Shift+P` → **Developer: Reload Window**.
You should see a GPU summary in the status bar (bottom left) and a **LabWatch GPU
Monitor** icon in the Activity Bar.

The extension identity is `galaxy-chjs.labwatch-gpu-status` with the display name
`LabWatch GPU Monitor`. Both were chosen after two earlier identities were burnt;
see the note below on why neither can be changed. · 扩展身份为
`galaxy-chjs.labwatch-gpu-status`，显示名 `LabWatch GPU Monitor`。

### Step 1 · Create a publisher · 创建发布者

1. <https://marketplace.visualstudio.com/manage> → sign in with the Microsoft
   account you will also use for the Azure DevOps token.
2. **Create publisher**. The ID is `galaxy-chjs`; the Manage page may show a
   shorter display name beside it (`chjs (galaxy-chjs)`). The manifest field
   `publisher` must carry the **ID**:

   `vscode-extension/package.json` declares `"publisher": "galaxy-chjs"`.

> **How to read that sidebar entry, and the mistake made here.** The header
> `chjs (galaxy-chjs)` looks like `id (display-name)` and was read that way, so
> the manifest was changed to `chjs`. The portal then refused the upload with a
> message that settles it beyond argument:
>
> > Publisher ID 'chjs' provided in the extension manifest should match the
> > publisher ID 'galaxy-chjs' under which you are trying to publish this
> > extension.
>
> So the ID is `galaxy-chjs`, the display name is the short one, and the original
> manifest was right. The useful lesson: when the portal names the expected
> publisher ID in an error, believe the error over the sidebar's formatting. ·
> 那个 `chjs (galaxy-chjs)` 看着像 `ID (显示名)`，我按这个理解把清单改成了 `chjs`，
> 结果网页上传直接给出决定性报错：清单里的 `chjs` 与发布者 ID `galaxy-chjs` 不一致。
> 所以 ID 是 `galaxy-chjs`，短名才是显示名，原来的清单本来就是对的。教训：当门户报错里
> 明确写出期望的 ID 时，以报错为准，不要靠侧边栏的排版去猜。

### Step 2 · Create an Azure DevOps PAT · 创建 Azure DevOps Token

The Marketplace authenticates with an Azure DevOps personal access token, not a
GitHub one. Marketplace 用的是 Azure DevOps 令牌，不是 GitHub 令牌。

**The direct URL does not work until you belong to an organization.** There is no
`dev.azure.com/_usersSettings/tokens` page — that path 404s, which is the trap
here. The token page lives inside an organization, so create one first:

**直接输入 URL 是行不通的**：`dev.azure.com/_usersSettings/tokens` 这个路径会 404。
令牌页面属于某个"组织"，所以必须先有组织：

1. If you have no organization yet, create one:
   <https://go.microsoft.com/fwlink/?LinkId=307137> or
   <https://aex.dev.azure.com/> → sign in with the **same Microsoft account** you
   use for the Marketplace → accept the default organization name it offers
   (e.g. `galaxy-chjs`). It is free and needs no Azure subscription.
   还没有组织就先建一个：用**同一个微软账号**登录，接受它给出的默认组织名即可。
   免费，不需要 Azure 订阅。
2. Now open your organization: `https://dev.azure.com/<your-org>/` — for example
   <https://dev.azure.com/galaxy-chjs/>.
3. In the **top-right corner**, click the **user-settings icon** next to your
   avatar (a person-with-a-gear icon) and choose **Personal access tokens**.
   点右上角头像旁的**用户设置图标**，选 **Personal access tokens**。
   Only after that is the address bar on the real token page.
4. **+ New Token**, then:

   | Field | Value |
   |---|---|
   | Name | `vsce-publish` |
   | Organization | **All accessible organizations** (required) |
   | Expiration | 30 days (global PATs retire 2026-12-01, so keep it short) |
   | Scopes | **Custom defined** → **Show all scopes** → **Marketplace** → **Manage**, and also **User profile** → **Read** |

   Click **Show all scopes** if the Marketplace group is not visible.
5. Copy the token — it is shown once.

> **`Access Denied: ... needs the following permission(s) on the resource
> /<publisher> to perform this action: View user permissions on a resource`**
> means the token itself is wrong, not the extension. The two causes seen here:
> the token was created inside a *single* organization instead of **All accessible
> organizations**, or it was created under a different Microsoft account than the
> one that owns the publisher. Recreate it with the table above, sign in to the
> Marketplace with that same account, and check <https://marketplace.visualstudio.com/manage>
> shows your publisher before retrying. · 这个报错说明**令牌**有问题，与扩展无关：
> 常见原因是用单个组织而不是"All accessible organizations"，或用与发布者归属不同的微软
> 账号创建。请按上表重建令牌，并确认门户里能看到你的发布者。
>
> Where the PAT error and the web upload disagree, prefer the **web upload**: it
> reports publisher-ID mismatches explicitly and needs no token at all. · 当命令行与
> 网页上传给出的信息不一致时，以**网页上传**为准：它会直接指出发布者 ID 不一致，而且
> 完全不需要令牌。

> Why this is fiddly: Visual Studio Code's Marketplace is hosted on Azure DevOps,
> so publishing authenticates as an Azure DevOps user. That is also why a GitHub
> token does not work here. · 为什么这么绕：Marketplace 托管在 Azure DevOps 上，
> 所以发布是拿 Azure DevOps 身份认证的，GitHub 令牌在这里没用。

### Step 3 · Publish · 发布

**Preferred: the web upload.** It gives exact errors and skips the token entirely.

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension
npx --yes @vscode/vsce package --no-dependencies
```

Then <https://marketplace.visualstudio.com/manage> → your publisher → **New
extension → Visual Studio Code** → upload `labwatch-gpu-status-1.3.3.vsix`.

Or by command line, once the token works:

```powershell
npx --yes @vscode/vsce login galaxy-chjs               # paste the PAT when asked
npx --yes @vscode/vsce publish --no-dependencies
```

Check <https://marketplace.visualstudio.com/manage/publishers/> — the extension
should appear within a few minutes.

### If the Marketplace says "suspicious content" · 如果提示"可疑内容"

**Where this stands.** The refusal comes from both the CLI and the web upload,
with a correct publisher ID and no SVG in the package. A full audit of the VSIX
found nothing that matches a documented trigger:

| Checked | Result |
|---|---|
| Files shipped | 12 - 4 JS, 3 JSON/XML, 2 PNG, 3 text, 17 KB total |
| External URLs | none; the only URL is `http://127.0.0.1:<port>` |
| Network calls | none in the extension; it shells out to the local `labwatch` CLI |
| Bundled dependencies / binaries / install scripts | none |
| Obfuscation, `eval`, base64 payloads, secrets | none |
| SVG images | none (the Activity Bar icon is a PNG) |
| Metadata URLs | repository answers 200; license MIT, icon, activationEvents all present |
| Publisher ID | `galaxy-chjs`, matching the ID the portal itself named |

**The publisher account is not the problem.** An inert 3 KB probe extension
(`marketplace-probe/`, one command, no network, no subprocess, no startup
activation) **uploaded successfully** through the same web path. That single
result eliminates the "new publisher false positive" explanation and proves the
trigger is inside this package. · 账号不是问题：一个 3 KB 的空壳探针扩展通过同样的
网页路径**上传成功**，因此"新账号误报"这一解释被排除，触发点就在本项目的包里。

**The mechanism is a keyword blocklist, answered by Microsoft in a comparable
case.** Another project refused with this exact message
([aallan/vera#1106](https://github.com/aallan/vera/issues/1106)) escalated, and
Marketplace Support replied on 20 July 2026:

> Due to the widespread use of certain keywords in spam or malicious content, we
> have blocked a few words from the Marketplace. Kindly share the complete VSIX
> manifest file for review so we can investigate further and provide you with an
> update.

That project had already eliminated the file-content explanations the hard way:
two uploads with materially different contents - one containing an executable
shell helper, one containing no executable of any kind - got byte-identical
verdicts. The check is a **string match against the metadata**, which is why the
message says *metadata* and why *content* sends everyone hunting through files.
Its own suspects were `llm` and `contracts`. · 另一项目遇到同一条报错并升级询问，
Marketplace 支持在 2026-07-20 明确回答：**因为某些关键词被大量用于垃圾/恶意内容，
Marketplace 屏蔽了部分词**，与文件内容无关。判定是对**元数据做字符串匹配**。该项目的
可疑词是 `llm` 与 `contracts`。

**Why our earlier stages never tested this.** `vsce` copies `keywords` from
`package.json` into the VSIX manifest as `<Tags>`, and every stage kept
`gpu, nvidia, cuda, …`:

```xml
<Tags>gpu,nvidia,cuda,monitoring,remote-ssh</Tags>
```

So when stage 1 was refused, that did *not* exonerate the keywords - it never
varied them. Comparable extensions do publish without keywords at all (for
example `yohan-pg/nvidia-smi-memory` declares none), but a blocklist aimed at
crypto-mining extensions would plausibly carry exactly this vocabulary. · 因此
第 1 级被拒并不能证明关键词无辜 —— 它从未被改动。同类扩展确实有完全不写 keywords 也能
上架的（如 `yohan-pg/nvidia-smi-memory`），但若黑名单是为挖矿类扩展设的，这套词很可能是
目标。

**A mistake to avoid, made here once.** The first attempt at these variants edited
`keywords` in the `package.json` **inside an already-built VSIX**. That tests
nothing: `vsce` had already written the keywords into `extension.vsixmanifest` as
`<Tags>`, and the Marketplace reads *that* file, so all six variants uploaded
identical tags - which is exactly why the "no keywords at all" variant was refused
like the full manifest. `scripts/make-keyword-variants.py` now writes a candidate
`package.json`, runs a real `vsce package` so the whole manifest is regenerated,
verifies the resulting `<Tags>`, and restores the repository copy afterwards. ·
**这里踩过一次坑**：第一版变体是在**已打好的 VSIX 内部**改 `keywords`，而 `vsce` 早已把
关键词写进 `extension.vsixmanifest` 的 `<Tags>`，Marketplace 读的是那个文件 —— 于是六个
变体上传的 tags 完全相同，"一个关键词都不留"的那一版当然也被同样拒绝。现在的脚本会写
候选 `package.json`、真正跑一次 `vsce package` 重新生成整份 manifest、校验 `<Tags>`，
最后把仓库里的文件还原。

**Result so far.** Variant `kw0-neutral` - **no keywords at all**, and a
description that names no vendor or hardware - **uploaded successfully**. So an
empty tag list is accepted, a vendor-free description is accepted, and the trigger
is in the vocabulary the later variants add back: *NVIDIA*, *GPU*, *CUDA*,
*monitoring*.

**Three hard constraints, each paid for with a failed upload.**

1. **An extension listing's identity is fixed at its first upload.** Both halves
   are reserved permanently and neither can be changed afterwards:

   - a different extension **name** gives *"The extension 'labwatch-gpu' already
     exists in the Marketplace. Please use a different 'name'"*;
   - the same name with a different **display name** gives *"This extension
     display name is taken"*;
   - **unpublishing and even removing the listing release neither.** That was
     verified twice: after the first listing was unpublished *and* removed, uploads
     still named `labwatch-vscode` were refused; and after the second listing
     (`labwatch-gpu`) was published, unpublished, and then removed, uploads named
     `labwatch-gpu` were still refused.

   So the identity has to be chosen **before the first upload of a series** and
   then left alone; the only thing that may change is the version, which must rise.
   Full sequence of identities used, in order:

   | Attempt | `name` | `displayName` | Outcome |
   |---|---|---|---|
   | 1 | `labwatch-vscode` | `LabWatch` | published 1.1.0, then removed - both names burnt |
   | 2 | `labwatch-gpu` | `LabWatch GPU` | published 1.1.0, then removed - both names burnt |
   | 3 | `labwatch-gpu-status` | `LabWatch GPU Status` | current |

   · **一个扩展条目的身份在首次上传时即固定**：改名报"扩展名已存在"，同名改显示名报
   "显示名已被占用"，而 **Unpublish 与 Remove 都不释放这两个名字**（已两次实测）。
   因此身份必须在上传前一次选定，之后**只能提高版本号**。
2. **A variant must be produced by a real `vsce package`.** Editing `keywords` in
   the `package.json` inside an already-built VSIX changes nothing, because `vsce`
   had already copied them into `extension.vsixmanifest` as `<Tags>` - the file the
   Marketplace actually reads.
3. **The version only goes up.** 1.1.0 is the version that was refused with the full
   manifest, so the bisection starts at 1.1.1 and the real release is cut afterwards
   as **1.2.0** - leaving room, because a published listing can never accept a
   lower version again.

| Order | Version | File | `<Tags>` | A refusal would mean |
|---|---|---|---|---|
| 1 | 1.1.1 | `tags-gpu` | `gpu` | ✅ **passed** |
| 2 | 1.1.2 | `tags-gpu-nvidia` | `gpu,nvidia` | ✅ **passed** |
| 3 | 1.1.3 | `tags-gpu-nvidia-cuda` | `gpu,nvidia,cuda` | ✅ **passed** |

That bracket leaves exactly three differences between the refused original
manifest and the passing one:

| | Difference | Variant that adds it back |
|---|---|---|
| A | the vendor word **NVIDIA** in the description | 1.1.4 |
| B | the extra tags `monitoring`, `remote-ssh` | 1.1.5 |
| C | the rest of `contributes` (`viewsWelcome`, `configuration`) | 1.1.6 |
| A+B+C | all of it | 1.1.7 |

| Order | Version | File | Adds | Result |
|---|---|---|---|---|
| 1 | 1.1.1 | `tags-gpu` | description says GPU, tag `gpu` | ✅ passed |
| 2 | 1.1.2 | `tags-gpu-nvidia` | tag `nvidia` | ✅ passed |
| 3 | 1.1.3 | `tags-gpu-nvidia-cuda` | tag `cuda` | ✅ passed |
| 4 | 1.1.4 | `vendor-description` | A | ✅ passed |
| 5 | 1.1.5 | `extra-keywords` | B | ✅ passed |
| 6 | 1.1.6 | `full-contributes` | C | ✅ passed |
| 7 | 1.1.7 | `all-three` | A+B+C | ✅ passed |

**Every variant passed, including 1.1.7 - which by construction carries exactly the
metadata of the manifest that was originally refused**: the vendor word in the
description, all five tags, and the full `contributes` set.

So the original refusal was *not* reproducible from the metadata. Since 1.1.7 and
the refused 1.1.0 differ in nothing else, the likely causes are the two things that
cannot be replayed - the version number and the publishing history of that first
listing (`labwatch-vscode`, published, unpublished, removed) - or a transient
scanner false positive. This also retires the keyword-blocklist hypothesis for this
project, even though that mechanism is real and documented.

· **七个变体全部通过**，其中 1.1.7 按构造就带着当初被拒那份清单的全部元数据：描述里的
厂商词、五个 tags、完整的 `contributes`。因此原始那次被拒**无法用元数据复现**。它与
1.1.7 之间已无其他差异，剩下的可能只有无法重放的因素（版本号、那个已被发布又删除的
首个条目）或扫描器偶发误判。针对本项目，关键词黑名单这一假设也随之排除 —— 尽管该机制
本身真实存在且已被微软确认。

**Final release: 1.3.0**, built from the repository manifest with the full metadata
restored - the richest description, all five keywords, complete `contributes` - plus
the automatic collector setup described just below. · **正式发布为 1.3.0**，使用仓库
清单、元数据全部保留，并包含下文的采集器自动配置。

### The collector is no longer a manual step · 采集器不再是手动步骤

Since extension 1.3.0 there is no separate install for the user to perform. If no
collector is found and Python 3.10+ is present, the extension offers to build a
private environment inside its own storage folder and install `labwatch-lite` into
it - no global installs, no `PATH` edits. The states it can be in, and what the
sidebar shows for each:

| State | Sidebar says | Action offered |
|---|---|---|
| `installable` | One step left: install the collector | **Set up LabWatch** (one click) |
| `no-python` | Python 3.10+ not found | How to connect · Open settings |
| `repair` | The private environment needs repair | **Repair LabWatch** |
| `failed` | Setup needs attention, with the real error | Run Doctor · How to connect |

A server without PyPI access is covered by `labwatch.pipIndexUrl` (a mirror) or by
`pip download labwatch-lite -d wheels` plus `pip install --no-index --find-links`.
`LabWatch: How to Connect` opens both languages of that guide in a tab.

The one thing this cannot fix is a machine with no Python at all; the extension says
so plainly and points at `labwatch.pythonPath` for an existing collector elsewhere.
· 唯一无法自动解决的情况是机器上完全没有 Python，此时扩展会明确说明，并提示用
`labwatch.pythonPath` 指向已有的采集器。

The real end-to-end path is checked by `scripts/verify-extension-setup.py`, which
builds a temporary environment with a real interpreter, installs from the bundled
The real end-to-end path is checked by `scripts/verify-extension-setup.py`, which
builds a temporary environment with a real interpreter, installs the collector into
it, and proves it answers. · 真实链路由 `scripts/verify-extension-setup.py` 验证：用真实
解释器建临时环境并安装采集器，然后验证它可用。

### Packaging the extension for a release · 打包扩展发布

The Marketplace listing takes days of review, so the `.vsix` is also attached to a
GitHub release and can be installed straight from the URL:

```bash
code --install-extension https://github.com/Galaxy-Chjs/LabWatch/releases/download/vscode-extension-v1.3.3/labwatch-gpu-status-1.3.3.vsix
```

`scripts/publish-extension-release.py <tag> <vsix> [<title>]` creates the release and
uploads the VSIX plus its `.sha256`. It reads the github.com credential Git already
stores (Git Credential Manager's generic entry), uses it for the two API calls, and
writes it nowhere else; with no such credential it prints the web-UI URL for a manual
upload instead. The tag is `vscode-extension-v<version>`, keeping the extension's
releases separate from the Python package's `v<version>`.

**The VSIX carries no wheels.** Shipping them was tried (1.3.1, 34 MB) on the theory
that the lab server had no outbound access; that theory was wrong, the user's own
words settled it, and the bundle was removed again. 0.4 MB with an honest error
message beats 34 MB built on a guess. · **VSIX 不内置 wheel。** 1.3.1 曾按"服务器没有
外网"的猜测内置（34 MB），该猜测是错的，已按你要求移除。0.4 MB 加上一句真实的报错，胜过
建立在猜测上的 34 MB。

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension
npx --yes @vscode/vsce package --no-dependencies
code --install-extension labwatch-gpu-status-1.3.3.vsix --force
```

If the vendor-description variant is refused too, the trigger is not free text at
all, and the ask to Microsoft becomes a single line: *which term or field is
blocked* - their own support vocabulary from the comparable case. · 若连"描述里写
NVIDIA"这一版也被拒，说明触发点不是 tags，只需向 Microsoft 问一句："被屏蔽的是哪个词或
哪个字段"。

Attach the VSIX and this information:

- Extension ID `galaxy-chjs.labwatch-gpu-status`, publisher `galaxy-chjs`
- VSIX SHA256 `79919EFC0F6FC928B66BE2E141110CF0B2A985F88CA0B738A4B999C5B4F091B7`, 17468 bytes
- Public repository <https://github.com/Galaxy-Chjs/LabWatch> (all sources, MIT)
- The command-line log and the web-upload screenshot
- **The control that matters:** the inert probe `labwatch-probe-0.0.1.vsix`
  (SHA256 `2C7C180D752FDBE5F53F626377682F41F2197E1713FF3BDBAF8B937C77C077A2`,
  3,390 bytes, one command, no network, no subprocess, no startup activation)
  **uploaded successfully under the same publisher minutes earlier**. So this is
  not an account-level flag, and the difference between the two packages is what
  is being objected to. · 关键对照：空壳探针（3,390 字节，无网络、无子进程、无启动
  激活）在同一发布者下**几分钟前上传成功**。因此这不是账号级拦截，被拦的是两个包之间的
  差别，请指明是哪一处。
- **The question to ask**, in Support's own vocabulary: *which keyword is on the
  blocklist, and what is the complete list?* Ask for the full manifest review they
  offered in the comparable case above. · 要问的问题就用支持自己的说法：**被屏蔽的是
  哪个关键词、完整名单是什么**，并按他们在那起案例中提出的方式请求复核 manifest。

<https://aka.ms/marketplacepublishersupport> (lands on
<https://partner.microsoft.com/en-us/support/v2>) or `vsmarketplace@microsoft.com`.

**Meanwhile, ship the VSIX yourself.** The extension is fully usable without the
Marketplace: attach the `.vsix` to a GitHub Release and readers install it with
`code --install-extension`. That needs no Microsoft review. · 同时可以先自行分发：
把 `.vsix` 挂到 GitHub Release，读者用 `code --install-extension` 安装，完全不经过审核。

### Checklist if a future upload is refused · 后续排查清单

1. **Publisher ID.** `package.json` must carry the publisher **ID**
   (`galaxy-chjs`), which is what the portal names in a mismatch error. Do not
   infer it from the Manage page formatting.
2. **Reachable public URLs.** `repository` must be a public repo; any
   `homepage` / `bugs` URL must answer 200.
3. **Nothing extra in the VSIX.** `.vscodeignore`, no `node_modules`, no
   binaries, no scripts.
4. **User-provided SVG.** `vsce` refuses to publish extensions containing
   user-supplied SVG images. This was the last candidate inside the package: the
   Activity Bar icon was `media/labwatch.svg` and is now `media/labwatch.png`,
   regenerated from the same geometry by `scripts/make-viewcontainer-icon.ps1`. ·
   `vsce` 拒绝包含用户自带 SVG 的扩展。这是包内最后一个可疑项：活动栏图标原为
   `media/labwatch.svg`，现已改为 `media/labwatch.png`，由
   `scripts/make-viewcontainer-icon.ps1` 按同样的几何形状生成。
5. **If all of that is clean**, the flag is not about this project's content — new
   publishers hit this as a false positive. Prove it with the inert probe in
   `D:\IDE\vscode\MyDemo\marketplace-probe\`: if that 3 KB extension is refused
   too, no edit to LabWatch can help, and the case is a support ticket rather than
   a code change. · 若以上都干净，就说明拦截与本项目内容无关（新发布者常被误判）。
   用 marketplace-probe 里那个 3 KB 空壳扩展证明：连它也被拒，就说明任何代码改动都
   没用，该走工单而不是继续改包。

### Step 4 · Update the README · 更新 README

The READMEs currently say the Marketplace listing is not published. Once it is,
replace that note with:

```markdown
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/galaxy-chjs.labwatch-gpu-status)](https://marketplace.visualstudio.com/items?itemName=galaxy-chjs.labwatch-gpu-status)
```

…and change "See `vscode-extension/README.md` to build from source" to an install
link. Tell me and I will do that edit.

### Important note about the extension version · 关于扩展版本

`vscode-extension/package.json` is at `1.1.0`, deliberately matching the Python
package. **Marketplace versions can never be reused either**, so bump both
together from now on.

### Optional: publish automatically · 可选：自动发布扩展

Once the manual publish works, add a workflow that runs
`vsce publish` on a tag, using `VSCE_PAT` as a repository secret. I left it out
because a first manual publish is the quickest way to discover a marketplace
metadata problem, and the error messages are clearer in a terminal.

---

## Part 4 · After the first release · 首次发布之后

- [x] Add the PyPI badges — done, in both READMEs.
- [x] Update the two "not published yet" notes in the READMEs — done; the PyPI
  publication is now stated as live and the Marketplace one moved to Limitations.
- [ ] Publish the extension, then replace the "not on the Marketplace yet" note in
  both READMEs with the Marketplace badge and an install link. Tell me and I will
  do that edit.
- [ ] Re-check the lab server still runs v1.1.0 (path in your own deployment
  notes — `.lab/` is no longer in the repository):

  ```bash
  ssh lab
  /path/to/LabWatch-lite/labwatch-run status --port 8010
  ```

- [ ] Try the extension in a **Remote-SSH** window pointing at `lab`. This is the
  one path that needs your eyes: the extension host runs on the server, so the
  sidebar should show the server's 8 GPUs, and **Open Full Dashboard** should open
  a forwarded `localhost` URL. I verified the data path programmatically, not the
  rendering.
- [ ] Decide whether you want a second server-side copy anywhere else. The deployment
  notes and captured server output (`ssh config`, deploy scripts, `nvidia-smi`
  dumps) were removed from the repository and its history on your instruction:
  they named an internal address, a login name and other users' command lines.
  They now live only in `D:\IDE\vscode\MyDemo\LabWatch-lab-private\` on this
  machine, and `.lab/` is git-ignored. Nothing about the published package
  depends on them. · 部署笔记与服务器原始输出（SSH 配置、部署脚本、`nvidia-smi`
  导出）已按你的要求从仓库**及其历史**中移除：它们包含内网地址、登录名和其他用户的
  命令行。这些内容现在只保留在本机的 `LabWatch-lab-private\` 目录，`.lab/` 已被
  git 忽略。已发布的包不依赖其中任何内容。
- [ ] **Optional, only if you want maximum thoroughness.** Rewriting history removes
  the files from every branch and tag, and `raw.githubusercontent.com` already
  answers 404 for them at the new commits. But GitHub keeps the *old* commits
  reachable by their SHA for a while, so someone who had bookmarked the previous
  `v1.1.0` commit could still fetch the old `.lab/ssh_config` by its exact URL.
  GitHub Support can purge those cached views on request (a DMCA-style
  "sensitive data removal" request); the file contained an internal address and a
  login name, no key material. · 可选、仅在你想做到最彻底时：重写历史已把文件从所有
  分支与标签中移除，新提交下 `raw.githubusercontent.com` 也返回 404；但 GitHub 会
  在一段时间内仍按 SHA 保留旧提交，若有人收藏了旧的 `v1.1.0` 提交，仍可用确切 URL 取到
  旧的 `.lab/ssh_config`。可向 GitHub Support 申请清除这些缓存视图。该文件只含内网地址
  与登录名，不含任何密钥。

---

## Part 5 · Optional polish · 可选的收尾

Not required for a release; only if you want them.

| Idea | Why it is worth it |
|---|---|
| Real screenshots in `docs/images/` from the lab server | Already done: eight of the twelve are from the 8-GPU server. |
| A short demo GIF | `docs/images/` has stills only. A 10-second GIF of the sidebar updating would help the README a lot. |
| Replace `Project.md` | It is the original spec and still in the repository. Move it to `docs/` or delete it if you do not want the raw brief public. |
| Add `CODE_OF_CONDUCT.md` / issue templates | Nice-to-have; GitHub offers templates in the repo settings. |
| `CHANGELOG.md` | The release notes are generated from commits; a hand-written changelog reads better for a portfolio. |

---

## Quick reference · 速查

```bash
# Push
git push -u origin main && git push origin v1.0.0 v1.0.1 v1.1.0

# Move v1.1.0 onto the tip of main, which carries the labwatch-lite name (once, before Step 4)
git pull origin main
git push origin :refs/tags/v1.1.0
git tag -f -a v1.1.0 -m "LabWatch v1.1.0" HEAD
git push origin v1.1.0

# Release a new version
#   1. bump pyproject.toml + labwatch/__init__.py
#   2. git commit -am "vX.Y.Z: ..."
#   3. git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z

# Verify the published package
uvx labwatch-lite --version && uvx labwatch-lite doctor

# Rebuild and reinstall the extension locally
cd vscode-extension && npm run compile \
  && npx --yes @vscode/vsce package --no-dependencies \
  && code --install-extension labwatch-gpu-status-1.3.3.vsix --force
```

## What is already verified, so you do not have to · 已经验证过、你不必再验的部分

| | |
|---|---|
| 179 backend tests, 87% coverage | locally, and in CI |
| 77 frontend tests, 8 Playwright E2E | locally, and in CI |
| 13 extension unit tests | locally, and in CI |
| The wheel contains and serves the dashboard | verified against the built wheel |
| `uvx`-equivalent install from wheel and from a checkout | verified |
| doctor / start / status / stop / version, and `python -m labwatch` | verified |
| The extension parses the real 8-GPU CLI payload | verified over SSH, 8/8 contract checks |
| v1.1.0 installed and serving on the lab server | verified, other users' jobs untouched |
| `main` and all three tags on GitHub, CI 6/6 green | verified |

What is **not** verified and needs you: the extension's rendering inside a live
VS Code window, PyPI publication, and the Marketplace listing.

未能验证、需要你的部分：扩展在真实 VS Code 窗口中的渲染、PyPI 发布、Marketplace 上线。
