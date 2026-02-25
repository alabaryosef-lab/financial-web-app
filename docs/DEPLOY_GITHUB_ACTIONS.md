# Deploy on push (GitHub Actions)

Deploy to your server when you push to `backend-no-firebase`.

## 1. Server: deploy user and SSH key

**1.1** Create a dedicated deploy user (optional; you can use `root`):

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy   # if it must run npm/pm2 that need permissions
```

**1.2** On the server, allow the app directory to be read/written by the deploy user:

```bash
# If using root, skip. Else e.g.:
sudo chown -R deploy:deploy /var/www/financial-web-app
```

**1.3** Generate an SSH key pair **on your local machine** (or use any machine that will act as “CI”):

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f github-deploy-key -N ""
```

This creates `github-deploy-key` (private) and `github-deploy-key.pub` (public).

**1.4** Add the **public** key to the server (so GitHub Actions can log in):

```bash
# Copy the public key to the server
cat github-deploy-key.pub
# On the server (as the user you will SSH as, e.g. root or deploy):
mkdir -p ~/.ssh
echo "PASTE_THE_PUBLIC_KEY_LINE_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**1.5** Ensure the deploy user can run the app and PM2:

```bash
# If using root, PM2 usually already works.
# If using deploy user, install PM2 for that user and ensure it runs the app:
sudo su - deploy
cd /var/www/financial-web-app
# Ensure git pull, npm, and pm2 work:
git pull origin backend-no-firebase
npm run deploy
pm2 list
```

Fix any permission or path issues until `npm run deploy` and `pm2 list` work when you SSH as that user.

## 2. GitHub: repository secrets

In GitHub: **Repository → Settings → Secrets and variables → Actions → New repository secret.**

Add these secrets:

| Name             | Value                     | Example / note                          |
|------------------|---------------------------|----------------------------------------|
| `SSH_HOST`       | Your server hostname or IP| `123.45.67.89` or `myserver.example.com` |
| `SSH_USER`       | SSH login user            | `root` or `deploy`                      |
| `SSH_PRIVATE_KEY`| Full contents of the **private** key | Contents of `github-deploy-key` (the file, not the `.pub` one) |

To copy the private key (e.g. on Mac/Linux):

```bash
cat github-deploy-key
# Copy the entire output including -----BEGIN ... KEY----- and -----END ... KEY-----
```

Paste that entire block into the `SSH_PRIVATE_KEY` secret value.

## 3. Workflow and app path

The workflow file is:

- **`.github/workflows/deploy.yml`**

It runs on every **push to `backend-no-firebase`** and executes on the server:

```bash
cd /var/www/financial-web-app
git fetch origin backend-no-firebase
git checkout backend-no-firebase
git pull origin backend-no-firebase
npm run deploy
```

If your app is **not** in `/var/www/financial-web-app`, edit `.github/workflows/deploy.yml` and change the `cd` path in the `script` to your app directory.

## 4. First run and checks

**4.1** Push a commit to `backend-no-firebase` (or merge a PR into it).

**4.2** In GitHub: **Actions** tab → select the **Deploy** workflow run and confirm the job succeeds.

**4.3** On the server, confirm the app is updated and running:

```bash
cd /var/www/financial-web-app
git log -1 --oneline
pm2 list
pm2 logs financial-web-app --lines 20
```

## 5. Optional: different app directory

If you use a different path (e.g. `/home/deploy/app`):

1. Edit `.github/workflows/deploy.yml`.
2. Replace `/var/www/financial-web-app` in the `script` with your path (in both the `cd` line and any other place it appears).

You do **not** need an extra secret for the path if you’re fine putting it in the workflow file.

## 6. Troubleshooting

- **Permission denied (publickey)**  
  - Check `SSH_USER` and `SSH_HOST`.  
  - Ensure the **public** key is in `~/.ssh/authorized_keys` for `SSH_USER` on the server.  
  - Ensure the **private** key is stored in `SSH_PRIVATE_KEY` exactly (no extra spaces, full key including BEGIN/END lines).

- **npm: command not found** or **pm2: command not found**  
  - SSH as `SSH_USER` and run `which npm` and `which pm2`.  
  - If they’re in a custom path (e.g. nvm), ensure that path is set in the shell when SSH runs (e.g. `source ~/.nvm/nvm.sh` or add to `~/.bashrc`).  
  - You can change the workflow `script` to use full paths or to source your profile before running `npm run deploy`.

- **Deploy runs but app doesn’t update**  
  - On the server run `git status` and `git log -1` in the app dir; confirm the branch and that `git pull` is not failing (e.g. local changes or permissions).  
  - Check the **Actions** run logs for the exact `script` output (git pull, npm install, build, pm2 restart).

- **Branch or repo**  
  - To use another branch, change the `branches` list in `.github/workflows/deploy.yml` and the branch name in the `script` (fetch/checkout/pull).
