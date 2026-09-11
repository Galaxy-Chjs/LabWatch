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

This is what turns `uvx labwatch-lite` from "works with `--from`" into "just works".

这一步决定 `uvx labwatch-lite` 能否直接可用（现在是 `uvx --from <path> labwatch`）。

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

Already installed on this machine as `labwatch.labwatch-vscode@1.1.0`. To reinstall
after a change:

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension
npm install
npm run compile
npx --yes @vscode/vsce package --no-dependencies
code --install-extension labwatch-vscode-1.1.0.vsix --force
```

Then reload the VS Code window: `Ctrl+Shift+P` → **Developer: Reload Window**.
You should see a GPU summary in the status bar (bottom left) and a **LabWatch**
icon in the Activity Bar.

### Step 1 · Create a publisher · 创建发布者

1. <https://marketplace.visualstudio.com/manage> → sign in with GitHub.
2. **Create publisher**. The publisher id is permanent and appears in the
   extension id (`publisher.name`), so pick it deliberately — `galaxy-chjs` matches
   your PyPI username and is a good choice.
3. `vscode-extension/package.json` currently declares `"publisher": "labwatch"`.
   If you create the publisher as `galaxy-chjs` instead, either change that field or
   create the publisher with the id `labwatch` (if still free) — the two must match
   exactly or `vsce publish` fails.

### Step 2 · Create an Azure DevOps PAT · 创建 Azure DevOps Token

The Marketplace authenticates with an Azure DevOps personal access token, not a
GitHub one. Marketplace 用的是 Azure DevOps 令牌，不是 GitHub 令牌。

1. Sign in at <https://dev.azure.com> with the **same Microsoft account** used for
   the Marketplace.
2. <https://dev.azure.com/_usersSettings/tokens> → **New Token**.
3. Settings:

   | Field | Value |
   |---|---|
   | Name | `vsce-publish` |
   | Organization | **All accessible organizations** (required) |
   | Expiration | 30 days |
   | Scopes | **Custom defined** → **Marketplace** → **Manage** |

4. Copy the token.

### Step 3 · Publish · 发布

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite\vscode-extension
npx --yes @vscode/vsce login <your-publisher-id>     # paste the PAT when asked
npx --yes @vscode/vsce publish --no-dependencies
```

Check <https://marketplace.visualstudio.com/manage/publishers/> — the extension
should appear within a few minutes.

### Step 4 · Update the README · 更新 README

The READMEs currently say the Marketplace listing is not published. Once it is,
replace that note with:

```markdown
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/<publisher-id>.labwatch-vscode)](https://marketplace.visualstudio.com/items?itemName=<publisher-id>.labwatch-vscode)
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

- [ ] Add the PyPI badges (Part 2 step 6) — tell me and I will edit both READMEs.
- [ ] Update the two "not published yet" notes in the READMEs.
- [ ] Re-check the lab server still runs v1.1.0:

  ```bash
  ssh lab
  /nfs-data1/chengjinshuai/ProjectDock/LabWatch-lite/labwatch-run status --port 8010
  ```

- [ ] Try the extension in a **Remote-SSH** window pointing at `lab`. This is the
  one path that needs your eyes: the extension host runs on the server, so the
  sidebar should show the server's 8 GPUs, and **Open Full Dashboard** should open
  a forwarded `localhost` URL. I verified the data path programmatically, not the
  rendering.
- [ ] Decide whether to keep the `.lab/` directory public (15 tracked files). It
  contains your server path (`/nfs-data1/chengjinshuai/...`) and hostname-adjacent
  details. Nothing secret — the SSH config carries no key material — but it is
  personal. Say the word and I will either generalise it or move it to a private repo.

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
  && code --install-extension labwatch-vscode-1.1.0.vsix --force
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
