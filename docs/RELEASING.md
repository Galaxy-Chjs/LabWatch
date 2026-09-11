# Releasing LabWatch · 发布指南

Everything that has to be done by a human, in order. The code side is finished;
what remains needs your accounts and credentials.

所有必须由你本人完成的步骤，按顺序排列。代码侧已经完成，剩下的都需要你的账号与凭据。

- [Part 1 · Push to GitHub](#part-1--push-to-github--推送到-github)
- [Part 2 · Publish to PyPI so `uvx labwatch` works](#part-2--publish-to-pypi--发布到-pypi)
- [Part 3 · VS Code extension](#part-3--vs-code-extension--vs-code-扩展)
- [Part 4 · After the first release](#part-4--after-the-first-release--首次发布之后)
- [Part 5 · Optional polish](#part-5--optional-polish--可选的收尾)

---

## Part 1 · Push to GitHub · 推送到 GitHub

The local repository is finished and ready: 171 tracked files, working tree clean,
one commit history ending at tag `v1.1.0`, and `origin` already pointing at
`https://github.com/Galaxy-Chjs/LabWatch.git`.

本地仓库已完成：171 个受控文件、工作区干净、提交历史以标签 `v1.1.0` 结尾，且 `origin`
已指向 `https://github.com/Galaxy-Chjs/LabWatch.git`。

### What is blocked, and why · 卡在哪里

| Method | Status |
|---|---|
| HTTPS push | Works, but needs a credential |
| SSH push | Port 22 reachable, but your key is **not registered on GitHub** |
| GitHub API | Reachable (read-only was verified) |

本地没有存储任何 GitHub 凭据，也没有安装 `gh` CLI，所以推送必须由你提供凭据。
**推荐做法：给我一个 Token，我来推送并核对结果。**

### Option A (recommended) · Create a token and let me push · 建 Token 让我推送

1. Open <https://github.com/settings/personal-access-tokens/new>
   (Fine-grained token, not the classic one.)

2. Fill in:

   | Field | Value |
   |---|---|
   | Token name | `labwatch-push` |
   | Expiration | 7 days (enough; you can delete it after) |
   | Repository access | **Only select repositories** → `Galaxy-Chjs/LabWatch` |
   | Permissions → Repository permissions → **Contents** | **Read and write** |
   | Permissions → Repository permissions → **Metadata** | Read-only (auto) |

3. Click **Generate token** and copy it. It looks like `github_pat_11ABC...`.

4. Send it to me in your next message. I will run:

   ```bash
   git push origin main
   git push origin v1.0.0 v1.0.1 v1.1.0
   ```

   and report the result. I will not store it anywhere; it lives only in the
   command I run. **Delete the token on GitHub afterwards.**

> Why not the classic token? A fine-grained token scoped to one repository with
> only `Contents: write` cannot touch anything else in your account. If it leaks,
> the blast radius is this one repository.

### Option B · Add your SSH key, then push yourself · 添加 SSH 公钥后自己推送

Your public key (already generated on this machine):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHbm1Grb9XjnIUm8n1Y8pGRrRWIXadXtxShxTOdQyPNP chengjs@LAPTOP-MSS5C7R8
```

1. Open <https://github.com/settings/keys> → **New SSH key** → paste the line
   above → **Add SSH key**.
2. Verify: `ssh -T git@github.com` should answer
   `Hi Galaxy-Chjs! You've successfully authenticated...`
3. Push:

   ```powershell
   cd D:\IDE\vscode\MyDemo\LabWatch-lite
   git remote set-url origin git@github.com:Galaxy-Chjs/LabWatch.git
   git push -u origin main
   git push origin v1.0.0 v1.0.1 v1.1.0
   ```

### What lands on GitHub · 推送后会看到什么

- 171 files: the `labwatch` package, the `frontend` sources, the built dashboard
  under `labwatch/ui`, the `vscode-extension`, `tests`, `scripts`, `docs`, `.lab`.
- 3 tags, producing 3 releases you can edit afterwards.
- The **CI workflow starts running immediately** on the first push (see below).

### Right after pushing · 推送后立刻检查

1. <https://github.com/Galaxy-Chjs/LabWatch/actions> — six CI jobs should run:
   `Backend tests`, `Frontend tests and build`, `Build and install the wheel`,
   `VS Code extension`, `End-to-end tests`, `Docker build and smoke test`.
2. Expect **all six green**. CI verifies things the local machine cannot, notably
   that the committed dashboard matches the frontend sources and that the wheel
   installs and serves the UI.
3. If `Docker build and smoke test` fails on a network hiccup, just re-run that job.

### Repository settings worth 2 minutes · 建议顺手设置

- **About** (top right of the repo page): paste the one-line description
  `Lightweight self-hosted dashboard for monitoring NVIDIA GPUs and AI servers`,
  and add topics: `gpu`, `nvidia`, `nvml`, `monitoring`, `dashboard`, `cuda`,
  `developer-tools`, `python`, `fastapi`, `react`.
- **Releases**: open each tag and paste the matching section from
  `docs/PROJECT_REPORT.html` if you want richer notes; `generate_release_notes`
  already produced a commit-based summary.
- Pin the repository on your profile when the six projects are done.

---

## Part 2 · Publish to PyPI · 发布到 PyPI

This is what turns `uvx labwatch` from "works with `--from`" into "just works".

这一步决定 `uvx labwatch` 能否直接可用（现在是 `uvx --from <path> labwatch`）。

### Step 1 · Create the accounts · 注册账号

1. <https://pypi.org/account/register/> — the real index.
2. <https://test.pypi.org/account/register/> — optional rehearsal index.

Pick a username you are happy to have on every `pip install` line. **`labwatch`
on PyPI is not yet taken** (verified), but the name is only reserved once you
publish.

### Step 2 · Enable 2FA · 开启两步验证

PyPI requires it for publishing. TOTP app or security key, under
<https://pypi.org/manage/account/>.

### Step 3 · Configure Trusted Publishing (no token needed) · 配置可信发布

The repository already has `.github/workflows/release.yml`, which publishes with
OIDC — there is no API token to create or leak.

1. <https://pypi.org/manage/account/publishing/> → **Add a new pending publisher**
2. Fill in exactly:

   | Field | Value |
   |---|---|
   | PyPI Project Name | `labwatch` |
   | Owner | `Galaxy-Chjs` |
   | Repository name | `LabWatch` |
   | Workflow name | `release.yml` |
   | Environment name | *(leave empty)* |

3. Save. The publisher stays "pending" until the first successful upload, then
   becomes active.

> Prefer a token instead? Create one at
> <https://pypi.org/manage/account/token/> (scope: project `labwatch`), add it as
> the repository secret `PYPI_API_TOKEN`, and replace the `pypa/gh-action-pypi-publish`
> step's `with:` block with `password: ${{ secrets.PYPI_API_TOKEN }}`. Trusted
> Publishing is better because nothing long-lived is stored.

### Step 4 · Release · 执行发布

A version is released by pushing a tag. The workflow checks that the tag, the
`pyproject.toml` version and `labwatch/__init__.py` all agree, builds, installs
the wheel in a clean environment, serves the dashboard from it, and only then
uploads.

```powershell
cd D:\IDE\vscode\MyDemo\LabWatch-lite
git push origin main                  # if not already pushed
git push origin v1.1.0                # triggers the Release workflow
```

Watch it at <https://github.com/Galaxy-Chjs/LabWatch/actions>.

**Dry run first (optional but sensible).** Run the Release workflow manually with
`dry_run = true` from the Actions tab: it builds and verifies without uploading.

> **`v1.1.0` is already tagged and already pushed in Part 1**, so the Release
> workflow for it will fire on that push. If you want to rehearse first, run the
> manual dry run of the workflow on `main` *before* pushing the tags, or delete the
> tag, rehearse, and re-create it:
>
> ```powershell
> git push origin :refs/tags/v1.1.0     # delete the remote tag
> git tag -d v1.1.0 && git tag -a v1.1.0 -m "LabWatch v1.1.0"
> git push origin v1.1.0
> ```

### Step 5 · Verify · 验证

Wait about a minute after the upload, then:

```bash
uvx labwatch --version
```

or

```bash
pipx install labwatch && labwatch doctor
```

Also check <https://pypi.org/project/labwatch/> renders the README.

### Step 6 · Add the badges · 加徽章

Once it is live, add to the top of `README.md` (and `README.zh-CN.md`):

```markdown
[![PyPI](https://img.shields.io/pypi/v/labwatch)](https://pypi.org/project/labwatch/)
![PyPI - Python Version](https://img.shields.io/pypi/pyversions/labwatch)
```

I left these out on purpose: a version badge pointing at a 404 looks worse than no
badge.

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

The `.vsix` was already installed on this machine. To reinstall after a change:

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
   extension id (`publisher.name`), so pick it deliberately — `galaxy-chjs` or
   `chjs` are good choices.
3. If you pick something other than `labwatch`, update `"publisher"` in
   `vscode-extension/package.json` (currently `labwatch`).

### Step 2 · Create an Azure DevOps PAT · 创建 Azure DevOps Token

The Marketplace authenticates with an Azure DevOps personal access token, not a
GitHub one.

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
- [ ] Delete the `labwatch-push` GitHub token if you created one.
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
- [ ] Decide whether to keep the `.lab/` directory public. It contains your server
  path (`/nfs-data1/chengjinshuai/...`) and hostname-adjacent details. Nothing
  secret — the SSH config carries no key material — but it is personal. Say the
  word and I will either generalise it or move it to a private repo.

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
# Push (once credentials exist)
git push -u origin main && git push origin v1.0.0 v1.0.1 v1.1.0

# Release a new version
#   1. bump pyproject.toml + labwatch/__init__.py
#   2. git commit -am "vX.Y.Z: ..."
#   3. git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z

# Verify the published package
uvx labwatch --version && uvx labwatch doctor

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

What is **not** verified and needs you: the extension's rendering inside a live
VS Code window, PyPI publication, and the Marketplace listing.

未能验证、需要你的部分：扩展在真实 VS Code 窗口中的渲染、PyPI 发布、Marketplace 上线。
