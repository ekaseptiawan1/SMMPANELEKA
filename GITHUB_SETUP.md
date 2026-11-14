# Upload to GitHub

1. Extract this ZIP on your computer.
2. Create a new empty repository on GitHub.
3. Upload the contents of this folder (including hidden files such as `.gitignore`) to the repository root, or run:

   ```bash
   git init
   git add .
   git commit -m "Initial BoostPanel project"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```

4. Do not commit `.env`, API keys, database passwords, or other secrets. Configure them as environment variables in your hosting provider.
5. Read `README.md` before deployment and complete the production-hardening checklist.

`preview-demo.html` is a standalone UI preview; the actual application is in `public/` and is served by `server.js`.
